package editorial

import (
	"bytes"
	"database/sql"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const removeBlogMigration = "1782518400_remove_blog.js"

// JS migration registration is process-global, including NewTestApp bootstrap.
// These fixtures must not run in parallel or leak their registry to other tests.
func isolateMigrations(t *testing.T) {
	t.Helper()
	registered := core.AppMigrations
	core.AppMigrations = core.MigrationsList{}
	t.Cleanup(func() { core.AppMigrations = registered })
}

func registerMigrationFixture(t *testing.T, app core.App, include func(string) bool) {
	t.Helper()
	dir := t.TempDir()
	files, err := os.ReadDir("../../pb_migrations")
	must(t, err)
	for _, file := range files {
		name := file.Name()
		if file.IsDir() || name < "1781568000_" || !strings.HasSuffix(name, ".js") || !include(name) {
			continue
		}
		raw, err := os.ReadFile(filepath.Join("../../pb_migrations", name))
		must(t, err)
		must(t, os.WriteFile(filepath.Join(dir, name), raw, 0600))
	}
	must(t, jsvm.Register(app, jsvm.Config{MigrationsDir: dir, HooksDir: t.TempDir()}))
}

func assertNoBlog(t *testing.T, app core.App) {
	t.Helper()
	for _, name := range []string{"editorial_entries", snapshots} {
		rows, err := app.FindRecordsByFilter(name, `kind = "blog"`, "", 0, 0)
		must(t, err)
		if len(rows) != 0 {
			t.Fatalf("%s retains %d blog records", name, len(rows))
		}
	}
	entries, err := app.FindCollectionByNameOrId("editorial_entries")
	must(t, err)
	kind := entries.Fields.GetByName("kind").(*core.SelectField)
	if !reflect.DeepEqual(kind.Values, []string{"software", "settings"}) {
		t.Fatalf("kind values: %v", kind.Values)
	}
	blog := core.NewRecord(entries)
	blog.Set("kind", "blog")
	blog.Set("slug", "forbidden")
	blog.Set("data", map[string]any{"title": "No longer supported"})
	if err := app.Save(blog); err == nil {
		t.Fatal("new blog entry accepted")
	}
}

func TestRemoveBlogFreshInstall(t *testing.T) {
	isolateMigrations(t)
	app, err := tests.NewTestApp(t.TempDir())
	must(t, err)
	defer app.Cleanup()
	registerMigrationFixture(t, app, func(string) bool { return true })
	must(t, app.RunAppMigrations())
	// Without editorial hooks, the narrowed schema itself must reject blog.
	assertNoBlog(t, app)
	Register(app)
	assertNoBlog(t, app)
	must(t, app.RunAppMigrations()) // Already applied: no-op.
	_, err = core.NewMigrationsRunner(app, core.AppMigrations).Down(1)
	if err == nil || !strings.Contains(err.Error(), "Restore paired backup and code") {
		t.Fatalf("rollback must refuse and require paired backup: %v", err)
	}
	assertNoBlog(t, app)
}

func TestRemoveBlogUpgrade(t *testing.T) {
	isolateMigrations(t)
	app, err := tests.NewTestApp(t.TempDir())
	must(t, err)
	defer app.Cleanup()
	registerMigrationFixture(t, app, func(name string) bool { return name != removeBlogMigration })
	must(t, app.RunAppMigrations())

	var raw bytes.Buffer
	must(t, png.Encode(&raw, image.NewRGBA(image.Rect(0, 0, 2, 2))))
	upload := func() *filesystem.File {
		f, err := filesystem.NewFileFromBytes(raw.Bytes(), "legacy.png")
		must(t, err)
		return f
	}
	entries, err := app.FindCollectionByNameOrId("editorial_entries")
	must(t, err)
	makeEntry := func(kind, slug string, published bool) *core.Record {
		r := core.NewRecord(entries)
		r.Set("kind", kind)
		r.Set("slug", slug)
		r.Set("published", published)
		r.Set("data", map[string]any{"title": slug})
		r.Set("assets", []*filesystem.File{upload()})
		must(t, app.Save(r))
		return r
	}
	publishLegacy := func(r *core.Record) *core.Record {
		must(t, app.RunInTransaction(func(tx core.App) error { return publish(tx, r) }))
		kind, slug := identity(r)
		snapshot, err := previous(app, kind, slug)
		must(t, err)
		return snapshot
	}
	withdrawLegacy := func(r *core.Record) *core.Record {
		must(t, app.RunInTransaction(func(tx core.App) error {
			return store(tx, Payload{Kind: "blog", Slug: r.GetString("slug"), State: "unpublished", Data: map[string]any{}, Assets: []Asset{}}, nil, nil)
		}))
		snapshot, err := previous(app, "blog", r.GetString("slug"))
		must(t, err)
		return snapshot
	}

	software := makeEntry("software", "surviving-software", true)
	softwareSnapshot := publishLegacy(software) // sequence 1
	blog := makeEntry("blog", "published-blog", true)
	oldBlogSnapshot := publishLegacy(blog) // sequence 2
	settings := makeEntry("settings", "site", true)
	settingsSnapshot := publishLegacy(settings) // sequence 3
	publishLegacy(blog)                         // multiple historical revisions
	items, err := app.FindCollectionByNameOrId("likes_items")
	must(t, err)
	item := core.NewRecord(items)
	item.Set("title", "Surviving collection item")
	item.Set("url", "https://example.com")
	item.Set("asset", upload())
	item.Set("published", true)
	must(t, app.Save(item))
	likeSnapshot := publishLegacy(item) // sequence 5; count+1 would collide after removal
	makeEntry("blog", "draft-blog", false)
	withdrawn := makeEntry("blog", "withdrawn-blog", false)
	publishLegacy(withdrawn)
	withdrawLegacy(withdrawn)
	for _, slug := range []string{"deleted-published", "deleted-withdrawn"} {
		r := makeEntry("blog", slug, true)
		publishLegacy(r)
		if slug == "deleted-withdrawn" {
			withdrawLegacy(r)
		}
		must(t, app.Delete(r))
	}
	// Cross the migration's batch boundary without expensive repeated uploads.
	for i := 0; i < 101; i++ {
		withdrawLegacy(withdrawn)
	}
	// Retain a fourth snapshot, so a count-based allocation collides with 5.
	lastSoftwareSnapshot := publishLegacy(software)

	removedFiles := []string{}
	removedRecords := []*core.Record{}
	for _, name := range []string{"editorial_entries", snapshots} {
		rows, err := app.FindRecordsByFilter(name, `kind = "blog"`, "", 0, 0)
		must(t, err)
		removedRecords = append(removedRecords, rows...)
		for _, r := range rows {
			for _, name := range r.GetStringSlice("assets") {
				storagePath := filepath.Join(app.DataDir(), "storage", r.BaseFilesPath(), name)
				data, err := os.ReadFile(storagePath)
				must(t, err)
				if !bytes.Equal(data, raw.Bytes()) {
					t.Fatal("invalid legacy fixture file")
				}
				removedFiles = append(removedFiles, storagePath)
				// PB must remove the whole record prefix, including cached thumbs.
				thumb := filepath.Join(filepath.Dir(storagePath), "thumbs_"+name, "2x2.png")
				must(t, os.MkdirAll(filepath.Dir(thumb), 0700))
				must(t, os.WriteFile(thumb, raw.Bytes(), 0600))
				removedFiles = append(removedFiles, thumb)
			}
		}
	}
	survivors := []*core.Record{software, settings, item, softwareSnapshot, settingsSnapshot, likeSnapshot, lastSoftwareSnapshot}
	for i, r := range survivors {
		// Compare persisted representations (e.g. JSON defaults), not unsaved
		// in-memory field representations from fixture creation.
		survivors[i], err = app.FindRecordById(r.Collection().Name, r.Id)
		must(t, err)
	}

	Register(app) // Runtime immutable hooks must be present during migration.
	if app.Delete(oldBlogSnapshot) == nil {
		t.Fatal("fixture snapshot wasn't immutable")
	}
	// Even before schema migration, Go validation must no longer allow blog.
	if err := app.Save(blog); err == nil || !strings.Contains(err.Error(), "Invalid editorial identity") {
		t.Fatalf("Go validation still accepts blog: %v", err)
	}
	router, err := apis.NewRouter(app)
	must(t, err)
	must(t, app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}))
	mux, err := router.BuildMux()
	must(t, err)
	builds, err := app.FindCollectionByNameOrId("publishing_builds")
	must(t, err)
	build := core.NewRecord(builds)
	build.SetEmail("migration@example.com")
	build.SetPassword("fixture-password-12345")
	must(t, app.Save(build))
	token, err := build.NewAuthToken()
	must(t, err)
	request := func(url string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, url, nil)
		req.Header.Set("Authorization", token)
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, req)
		return res
	}
	oldPayload, err := decode(oldBlogSnapshot)
	must(t, err)
	oldURL := oldPayload.Assets[0].Path
	if res := request(oldURL); res.Code != http.StatusOK || !bytes.Equal(res.Body.Bytes(), raw.Bytes()) {
		t.Fatalf("old asset not served before migration: %d", res.Code)
	}
	registerMigrationFixture(t, app, func(name string) bool { return name == removeBlogMigration })
	must(t, app.RunAppMigrations())
	assertNoBlog(t, app)
	for _, r := range removedRecords {
		if _, err := app.FindRecordById(r.Collection().Name, r.Id); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("blog record %s survived: %v", r.Id, err)
		}
	}
	if res := request(oldURL); res.Code != http.StatusNotFound {
		t.Fatalf("removed blog asset still accessible: %d", res.Code)
	}
	if res := request("/api/publishing/content"); res.Code != http.StatusOK || strings.Contains(res.Body.String(), `"kind":"blog"`) {
		t.Fatalf("invalid post-migration content: %d %s", res.Code, res.Body.String())
	}
	// Native PB cleanup runs asynchronously after commit.
	deadline := time.Now().Add(5 * time.Second)
	for _, name := range removedFiles {
		for {
			_, err := os.Stat(name)
			if errors.Is(err, os.ErrNotExist) {
				break
			}
			if err != nil || time.Now().After(deadline) {
				t.Fatalf("blog file wasn't cleaned up: %s (%v)", name, err)
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
	for _, before := range survivors {
		after, err := app.FindRecordById(before.Collection().Name, before.Id)
		must(t, err)
		if !reflect.DeepEqual(before.PublicExport(), after.PublicExport()) {
			t.Fatalf("migration changed surviving %s/%s", before.Collection().Name, before.Id)
		}
		names := before.GetStringSlice("assets")
		if before.Collection().Name == "likes_items" {
			names = []string{before.GetString("asset")}
		}
		for _, name := range names {
			data, err := os.ReadFile(filepath.Join(app.DataDir(), "storage", before.BaseFilesPath(), name))
			must(t, err)
			if !bytes.Equal(data, raw.Bytes()) {
				t.Fatal("migration changed surviving asset")
			}
		}
	}
	for _, snapshot := range []*core.Record{softwareSnapshot, settingsSnapshot, likeSnapshot} {
		if app.Delete(snapshot) == nil {
			t.Fatal("migration disabled runtime snapshot deletion guard")
		}
		snapshot.Set("slug", "tampered")
		if app.Save(snapshot) == nil {
			t.Fatal("migration disabled runtime snapshot update guard")
		}
	}
	// Publishing after deletion must use max(sequence)+1, not count+1.
	must(t, app.Save(software))
	next, err := previous(app, "software", "surviving-software")
	must(t, err)
	if next.GetInt("sequence") != lastSoftwareSnapshot.GetInt("sequence")+1 {
		t.Fatalf("sparse sequence: got %d after %d", next.GetInt("sequence"), lastSoftwareSnapshot.GetInt("sequence"))
	}
}
