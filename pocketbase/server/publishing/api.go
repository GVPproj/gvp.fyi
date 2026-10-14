// Package publishing captures immutable release catalogue revisions.
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
	"strings"
	"unicode/utf8"

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
		if !e.Record.IsNew() && e.Record.GetString("slug") != e.Record.Original().GetString("slug") {
			return apis.NewBadRequestError("Release slug is immutable after creation.", nil)
		}
		publishing := e.Record.GetBool("published")
		withdrawing := !publishing && e.Record.Original().GetBool("published")
		recreating := e.Record.IsNew() && !publishing
		if !publishing && !withdrawing && !recreating {
			return e.Next()
		}
		original := e.App
		defer func() { e.App = original }()
		return original.RunInTransaction(func(tx core.App) error {
			e.App = tx
			if err := e.Next(); err != nil {
				return err
			}
			if recreating {
				// Saving a retained slug with Published off must allow withdrawal
				// without reconstructing and publishing deleted working files first.
				previous, err := tx.FindRecordsByFilter(snapshots, "slug = {:slug}", "-sequence", 1, 0, dbx.Params{"slug": e.Record.GetString("slug")})
				if err != nil {
					return err
				}
				if len(previous) == 0 {
					return nil
				}
				var payload struct {
					State string `json:"state"`
				}
				if err := json.Unmarshal([]byte(previous[0].GetString("payload")), &payload); err != nil {
					return err
				}
				if payload.State == "unpublished" {
					return nil
				}
				withdrawing = true
			}
			if withdrawing {
				if err := unpublish(tx, e.Record); err != nil {
					return apis.NewBadRequestError("Unpublish requires a previously published release.", nil)
				}
				return nil
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
		e.Router.GET("/api/publishing/releases", func(e *core.RequestEvent) error {
			if err := authorize(e); err != nil {
				return err
			}
			records, err := e.App.FindRecordsByFilter(snapshots, "", "-sequence", 0, 0)
			if err != nil {
				return e.InternalServerError("Publication unavailable.", nil)
			}
			latest := []any{}
			seen := map[string]bool{}
			for _, record := range records {
				slug := record.GetString("slug")
				if !seen[slug] {
					latest = append(latest, record.Get("payload"))
					seen[slug] = true
				}
			}
			return e.JSON(http.StatusOK, latest)
		})
		e.Router.GET("/api/publishing/releases/{slug}", func(e *core.RequestEvent) error {
			if err := authorize(e); err != nil {
				return err
			}
			records, err := e.App.FindRecordsByFilter(snapshots, "slug = {:slug}", "-sequence", 1, 0, dbx.Params{"slug": e.Request.PathValue("slug")})
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
			if err != nil || record.GetString("artwork") == "" {
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

// Withdrawal is an explicit revision, not a missing-record response. Builds must
// distinguish intentional removal from an unavailable or incomplete publication.
// Older artwork stays readable so a build already pinned to a revision can finish.
func unpublish(app core.App, release *core.Record) error {
	previous, err := app.FindRecordsByFilter(snapshots, "slug = {:slug}", "-sequence", 1, 0, dbx.Params{"slug": release.GetString("slug")})
	if err != nil {
		return err
	}
	if len(previous) == 0 {
		return errors.New("never published")
	}
	collection, err := app.FindCollectionByNameOrId(snapshots)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Id = core.GenerateDefaultRandomId()
	record.Set("slug", release.GetString("slug"))
	count, err := app.CountRecords(snapshots)
	if err != nil {
		return err
	}
	record.Set("sequence", count+1)
	record.Set("payload", map[string]any{"revision": record.Id, "slug": release.GetString("slug"), "state": "unpublished"})
	return app.Save(record)
}

func publish(app core.App, release *core.Record) error {
	category := release.GetString("category")
	if category == "" && release.GetString("slug") != "watery-grave-ep" {
		return errors.New("category required")
	}
	list := []map[string]any{}
	if raw := release.GetString("tracks"); raw != "" && raw != "null" {
		if err := json.Unmarshal([]byte(raw), &list); err != nil {
			return errors.New("invalid tracks")
		}
	}
	for i, row := range list {
		for key := range row {
			if key != "title" && key != "track_num" && key != "duration" && key != "audio_url" {
				return errors.New("unknown track field")
			}
		}
		title, ok := row["title"].(string)
		if !ok || strings.TrimSpace(title) == "" || utf8.RuneCountInString(title) > 500 || row["track_num"] != float64(i+1) {
			return errors.New("invalid track title or order")
		}
		if value, exists := row["duration"]; exists {
			n, ok := value.(float64)
			if !ok || n < 0 {
				return errors.New("invalid duration")
			}
		}
		if value, exists := row["audio_url"]; exists {
			if _, ok := value.(string); !ok {
				return errors.New("invalid audio reference")
			}
		}
	}
	data := map[string]any{"tracks": list}
	for _, key := range []string{"slug", "title", "artist", "release_date", "about"} {
		data[key] = release.GetString(key)
	}
	for _, key := range []string{"url", "display_date", "category", "credit", "display_title", "youtube_video_id"} {
		if value := release.GetString(key); value != "" {
			data[key] = value
		}
	}
	// Older tracer records/snapshots predate categories.
	if _, ok := data["category"]; !ok && release.GetString("slug") == "watery-grave-ep" {
		data["category"] = "miracle-fortress"
	}
	for _, key := range []string{"album_id", "art_id", "player_height"} {
		if value := release.GetFloat(key); value != 0 {
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
	record.Set("slug", release.GetString("slug"))
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
