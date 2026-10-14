// Command import-release is an offline, single-release operator tool.
package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"reflect"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	_ "modernc.org/sqlite"
)

const slug = "watery-grave-ep"

var refused = errors.New("import failed")

type track struct {
	Title  string `json:"title"`
	Number int    `json:"track_num"`
	Audio  string `json:"audio_url"`
}
type release struct {
	Title       string  `json:"title"`
	Artist      string  `json:"artist"`
	Date        string  `json:"release_date"`
	DisplayDate string  `json:"display_date"`
	About       string  `json:"about"`
	Artwork     string  `json:"artwork_url"`
	Tracks      []track `json:"tracks"`
}

var approvedTracks = []track{
	{"Watery Grave", 1, "/audio/watery-grave/01-watery-grave.mp3"},
	{"Forgiven", 2, "/audio/watery-grave/02-forgiven.mp3"},
	{"Secret Passage Way", 3, "/audio/watery-grave/03-secret-passage-way.mp3"},
	{"Eschatology", 4, "/audio/watery-grave/04-eschatology.mp3"},
	{"Sacred Flowers", 5, "/audio/watery-grave/05-sacred-flowers.mp3"},
}

func decode(r io.Reader) (release, error) {
	var v release
	d := json.NewDecoder(io.LimitReader(r, 65537))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return v, refused
	}
	if d.Decode(new(any)) != io.EOF {
		return v, refused
	}
	// This is deliberately not a general release importer. Pin the approved source
	// metadata and ordered URL allowlist rather than silently dropping extra fields.
	if v.Title != "Watery Grave EP" || v.Artist != "Miracle Fortress" || v.Date != "2005" ||
		v.DisplayDate != "Winter 2005, Self Released" || v.About != "A self-released EP from winter 2005." ||
		v.Artwork != "/images/music-releases/watery-grave.jpg" || !reflect.DeepEqual(v.Tracks, approvedTracks) {
		return v, refused
	}
	return v, nil
}

// No migration packages or application hooks are registered in this binary.
// Bootstrap must not initialize a new database or run schema migrations.
func existingDB(dir string) error {
	path, err := filepath.Abs(filepath.Join(dir, "data.db"))
	if err != nil {
		return refused
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return refused
	}
	if len(core.SystemMigrations.Items()) != 0 {
		return refused
	}
	u := url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return refused
	}
	defer db.Close()
	for _, table := range []string{"_migrations", "_collections", "_params", "publishing_releases", "publishing_snapshots"} {
		var n int
		if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&n); err != nil || n != 1 {
			return refused
		}
	}
	return nil
}

func checkSchema(app core.App) error {
	schemas := map[string]map[string]string{
		"publishing_releases":  {"slug": "text", "title": "text", "artist": "text", "release_date": "text", "display_date": "text", "about": "text", "artwork": "file", "published": "bool", "tracks": "json"},
		"publishing_snapshots": {"slug": "text", "sequence": "number", "payload": "json", "artwork": "file"},
	}
	for name, fields := range schemas {
		c, err := app.FindCollectionByNameOrId(name)
		if err != nil || !c.IsBase() || c.ListRule != nil || c.ViewRule != nil {
			return refused
		}
		for name, kind := range fields {
			f := c.Fields.GetByName(name)
			if f == nil || f.Type() != kind {
				return refused
			}
		}
	}
	r, _ := app.FindCollectionByNameOrId("publishing_releases")
	artwork := r.Fields.GetByName("artwork").(*core.FileField)
	if !artwork.Protected || artwork.MaxSelect != 1 {
		return refused
	}
	return nil
}

func saveDraft(app core.App, v release, artwork *filesystem.File) (string, error) {
	var id string
	err := app.RunInTransaction(func(tx core.App) error {
		if err := checkSchema(tx); err != nil {
			return err
		}
		for _, name := range []string{"publishing_releases", "publishing_snapshots"} {
			records, err := tx.FindRecordsByFilter(name, "slug = 'watery-grave-ep'", "", 1, 0)
			if err != nil || len(records) != 0 {
				return refused
			}
		}
		c, _ := tx.FindCollectionByNameOrId("publishing_releases")
		r := core.NewRecord(c)
		for key, value := range map[string]any{"slug": slug, "title": v.Title, "artist": v.Artist, "release_date": v.Date, "display_date": v.DisplayDate, "about": v.About, "published": false, "tracks": v.Tracks, "artwork": artwork} {
			r.Set(key, value)
		}
		if err := tx.Save(r); err != nil {
			return err
		}
		id = r.Id
		return nil
	})
	return id, err
}

func run(args []string) (string, error) {
	flags := flag.NewFlagSet("import-release", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dir := flags.String("dir", "", "existing PocketBase data directory")
	source := flags.String("release", "", "approved release JSON object")
	art := flags.String("artwork", "", "local artwork file")
	if flags.Parse(args) != nil || flags.NArg() != 0 || *dir == "" || *source == "" || *art == "" {
		return "", refused
	}
	f, err := os.Open(*source)
	if err != nil {
		return "", refused
	}
	v, err := decode(f)
	f.Close()
	if err != nil {
		return "", refused
	}
	info, err := os.Stat(*art)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 || info.Size() > 10485760 {
		return "", refused
	}
	artwork, err := filesystem.NewFileFromPath(*art)
	if err != nil {
		return "", refused
	}
	if err := existingDB(*dir); err != nil {
		return "", refused
	}
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: *dir})
	defer app.ClearBootstrap()
	if err := app.Bootstrap(); err != nil {
		return "", refused
	}
	// Never let a stored S3 configuration cause network access.
	if app.Settings().S3.Enabled {
		return "", refused
	}
	return saveDraft(app, v, artwork)
}

func main() {
	id, err := run(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "Import failed.")
		os.Exit(1)
	}
	fmt.Printf("Imported record %s; tracks=5\n", id)
}
