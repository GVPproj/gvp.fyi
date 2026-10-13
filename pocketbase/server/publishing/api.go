// Package publishing implements an isolated, additive release publishing tracer.
package publishing

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"

	_ "golang.org/x/image/webp"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const snapshots = "publishing_snapshots"

func Register(app core.App) {
	// Request guards also apply to dashboard superusers. Internal snapshot creation
	// bypasses requests, never these guards through a privileged client token.
	deny := func(e *core.RecordRequestEvent) error {
		return e.ForbiddenError("Published snapshots are immutable.", nil)
	}
	app.OnRecordCreateRequest(snapshots).BindFunc(deny)
	app.OnRecordUpdateRequest(snapshots).BindFunc(deny)
	app.OnRecordDeleteRequest(snapshots).BindFunc(deny)
	save := func(e *core.RecordEvent) error {
		if !e.Record.GetBool("publish") {
			return e.Next()
		}
		e.Record.Set("publish", false)
		original := e.App
		defer func() { e.App = original }()
		return original.RunInTransaction(func(tx core.App) error {
			e.App = tx
			if err := e.Next(); err != nil {
				return err
			}
			if err := publish(tx, e.Record); err != nil {
				return apis.NewBadRequestError("Publication requires a complete release, ordered tracks and valid artwork.", nil)
			}
			return nil
		})
	}
	app.OnRecordCreate("publishing_releases").BindFunc(save)
	app.OnRecordUpdate("publishing_releases").BindFunc(save)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/publishing/releases/{slug}", func(e *core.RequestEvent) error {
			if err := authorize(e); err != nil {
				return err
			}
			if e.Request.PathValue("slug") != "watery-grave-ep" {
				return e.NotFoundError("Not published.", nil)
			}
			records, err := e.App.FindRecordsByFilter(snapshots, "slug = 'watery-grave-ep'", "-sequence", 1, 0)
			if err != nil {
				return e.InternalServerError("Publication unavailable.", nil)
			}
			if len(records) == 0 {
				return e.NotFoundError("Not published.", nil)
			}
			return e.JSON(http.StatusOK, records[0].Get("payload"))
		})
		e.Router.GET("/api/publishing/artwork/{revision}", func(e *core.RequestEvent) error {
			if err := authorize(e); err != nil {
				return err
			}
			record, err := e.App.FindRecordById(snapshots, e.Request.PathValue("revision"))
			if err != nil {
				return e.NotFoundError("Not published.", nil)
			}
			fs, err := e.App.NewFilesystem()
			if err != nil {
				return e.InternalServerError("Artwork unavailable.", nil)
			}
			defer fs.Close()
			return fs.Serve(e.Response, e.Request, record.BaseFilesPath()+"/"+record.GetString("artwork"), record.GetString("artwork"))
		})
		return e.Next()
	})
}

func authorize(e *core.RequestEvent) error {
	e.Response.Header().Set("Cache-Control", "no-store")
	e.Response.Header().Set("Vary", "Authorization")
	if e.Auth == nil || e.Auth.Collection().Name != "publishing_builds" {
		return e.ForbiddenError("Build identity required.", nil)
	}
	return nil
}

func publish(app core.App, release *core.Record) error {
	if release.GetString("slug") != "watery-grave-ep" {
		return errors.New("unsupported release")
	}
	tracks, err := app.FindRecordsByFilter("publishing_tracks", "release = {:release}", "track_num", 0, 0, dbx.Params{"release": release.Id})
	if err != nil {
		return err
	}
	if len(tracks) == 0 {
		return errors.New("missing tracks")
	}
	list := make([]map[string]any, 0, len(tracks))
	for i, track := range tracks {
		if track.GetInt("track_num") != i+1 {
			return errors.New("incomplete order")
		}
		row := map[string]any{"title": track.GetString("title"), "track_num": track.GetInt("track_num")}
		var duration any
		if err := json.Unmarshal([]byte(track.GetString("duration")), &duration); err == nil && duration != nil {
			n, ok := duration.(float64)
			if !ok || n < 0 {
				return errors.New("invalid duration")
			}
			row["duration"] = duration
		}
		if value := track.GetString("audio_url"); value != "" {
			row["audio_url"] = value
		}
		list = append(list, row)
	}
	data := map[string]any{"tracks": list}
	for _, key := range []string{"slug", "title", "artist", "release_date", "about"} {
		data[key] = release.GetString(key)
	}
	for _, key := range []string{"url", "display_date"} {
		if value := release.GetString(key); value != "" {
			data[key] = value
		}
	}
	var streaming any
	if json.Unmarshal([]byte(release.GetString("streaming")), &streaming) == nil && streaming != nil {
		data["streaming"] = streaming
	}
	fs, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fs.Close()
	reader, err := fs.GetReader(release.BaseFilesPath() + "/" + release.GetString("artwork"))
	if err != nil {
		return err
	}
	defer reader.Close()
	raw, err := io.ReadAll(io.LimitReader(reader, 10485761))
	if err != nil {
		return err
	}
	if len(raw) > 10485760 {
		return errors.New("oversized artwork")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return err
	}
	if (format != "png" && format != "jpeg" && format != "webp") || config.Width > 4096 || config.Height > 4096 || config.Width*config.Height > 16000000 {
		return errors.New("invalid artwork")
	}
	if _, _, err := image.Decode(bytes.NewReader(raw)); err != nil {
		return err
	}
	file, err := filesystem.NewFileFromBytes(raw, "artwork."+format)
	if err != nil {
		return err
	}
	collection, err := app.FindCollectionByNameOrId(snapshots)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("slug", "watery-grave-ep")
	record.Set("artwork", file)
	count, err := app.CountRecords(snapshots)
	if err != nil {
		return err
	}
	record.Set("sequence", count+1)
	// Allocate the revision before constructing its pinned artwork path.
	record.Id = core.GenerateDefaultRandomId()
	hash := sha256.Sum256(raw)
	record.Set("payload", map[string]any{"revision": record.Id, "release": data, "artwork": map[string]any{
		"path": "/api/publishing/artwork/" + record.Id, "width": config.Width, "height": config.Height, "sha256": hex.EncodeToString(hash[:]),
	}})
	return app.Save(record)
}
