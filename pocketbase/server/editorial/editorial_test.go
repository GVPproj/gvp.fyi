package editorial

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func TestRealPocketBase(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	must(t, err)
	defer app.Cleanup()
	migrations, err := filepath.Abs("../../pb_migrations")
	must(t, err)
	// The shared backend retains pre-v0.40 migration history which is already
	// applied in production, not executable against a brand-new current DB.
	// This fixture exercises the additive site migrations; real-data upgrade
	// rehearsal remains a separate rollout gate.
	fixtureMigrations := t.TempDir()
	migrationFiles, err := os.ReadDir(migrations)
	must(t, err)
	for _, entry := range migrationFiles {
		if entry.IsDir() || entry.Name() < "1781568000_" || !strings.HasSuffix(entry.Name(), ".js") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(migrations, entry.Name()))
		must(t, err)
		must(t, os.WriteFile(filepath.Join(fixtureMigrations, entry.Name()), data, 0600))
	}
	hooks, err := filepath.Abs("../../pb_hooks")
	must(t, err)
	jsvm.MustRegister(app, jsvm.Config{MigrationsDir: fixtureMigrations, HooksDir: hooks})
	must(t, app.RunAppMigrations())
	// Seed an old published Like before registering the new hooks.
	groups, err := app.FindCollectionByNameOrId("likes_collections")
	must(t, err)
	group := core.NewRecord(groups)
	group.Set("name", "Original name")
	must(t, app.Save(group))
	items, err := app.FindCollectionByNameOrId("likes_items")
	must(t, err)
	legacy := core.NewRecord(items)
	legacy.Set("title", "Legacy")
	legacy.Set("url", "https://example.com")
	legacy.Set("published", true)
	must(t, app.Save(legacy))
	Register(app)
	rows, err := latest(app)
	must(t, err)
	if len(rows) != 0 {
		t.Fatal("implicit backfill")
	}
	if requireSeededLikes(app, rows) == nil {
		t.Fatal("unseeded Likes did not fail closed")
	}
	must(t, SeedLikes(app))
	must(t, SeedLikes(app))
	rows, err = latest(app)
	must(t, err)
	if len(rows) != 1 {
		t.Fatal("seed not idempotent")
	}
	router, err := apis.NewRouter(app)
	must(t, err)
	must(t, app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}))
	mux, err := router.BuildMux()
	must(t, err)
	tokens := map[string]string{}
	for _, name := range []string{"publishing_builds", "likes_owners", "_superusers"} {
		c, err := app.FindCollectionByNameOrId(name)
		must(t, err)
		r := core.NewRecord(c)
		r.SetEmail(name + "@example.com")
		r.SetPassword("fixture-password-12345")
		must(t, app.Save(r))
		tokens[name], err = r.NewAuthToken()
		must(t, err)
	}
	request := func(method, url, token, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, strings.NewReader(body))
		req.Header.Set("Authorization", token)
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, req)
		return res
	}
	content := func() []Payload {
		res := request("GET", "/api/publishing/content", tokens["publishing_builds"], "")
		if res.Code != 200 {
			t.Fatalf("content: %d %s", res.Code, res.Body.String())
		}
		var out []Payload
		must(t, json.Unmarshal(res.Body.Bytes(), &out))
		return out
	}
	t.Run("authorization", func(t *testing.T) {
		for _, token := range []string{"", tokens["likes_owners"], tokens["_superusers"]} {
			if r := request("GET", "/api/publishing/content", token, ""); r.Code != 403 {
				t.Fatalf("unexpected auth status %d", r.Code)
			}
		}
		for _, method := range []string{"GET", "POST"} {
			r := request(method, "/api/collections/editorial_snapshots/records", tokens["_superusers"], `{}`)
			if r.Code < 400 {
				t.Fatal("general snapshot API allowed")
			}
		}
	})
	entries, err := app.FindCollectionByNameOrId("editorial_entries")
	must(t, err)
	entry := core.NewRecord(entries)
	entry.Set("kind", "software")
	entry.Set("slug", "tipbox")
	entry.Set("data", map[string]any{"title": "Draft"})
	must(t, app.Save(entry))
	if len(content()) != 1 {
		t.Fatal("draft leaked")
	}
	t.Run("validation", func(t *testing.T) {
		entry.Set("slug", "renamed")
		if app.Save(entry) == nil {
			t.Fatal("mutable slug")
		}
		entry.Set("slug", "tipbox")
		entry.Set("data", []string{"not an object"})
		if app.Save(entry) == nil {
			t.Fatal("accepted non-object")
		}
		entry.Set("data", map[string]any{"title": "Public"})
		other := core.NewRecord(entries)
		other.Set("kind", "software")
		other.Set("slug", "tipbox")
		other.Set("data", map[string]any{})
		if app.Save(other) == nil {
			t.Fatal("duplicate identity")
		}
	})
	var raw bytes.Buffer
	must(t, png.Encode(&raw, image.NewRGBA(image.Rect(0, 0, 2, 2))))
	upload := func() *filesystem.File {
		f, err := filesystem.NewFileFromBytes(raw.Bytes(), "screenshot.png")
		must(t, err)
		return f
	}
	entry.Set("assets", []*filesystem.File{upload()})
	entry.Set("published", true)
	must(t, app.Save(entry))
	first, err := previous(app, "software", "tipbox")
	must(t, err)
	p, err := decode(first)
	must(t, err)
	if len(p.Assets) != 1 || p.Assets[0].Name != entry.GetStringSlice("assets")[0] {
		t.Fatal("source filename mapping lost")
	}
	assetPath := p.Assets[0].Path
	t.Run("retained files and immutable API", func(t *testing.T) {
		for _, token := range []string{"", tokens["_superusers"], tokens["likes_owners"]} {
			if r := request("GET", assetPath, token, ""); r.Code != 403 {
				t.Fatal("asset auth bypass")
			}
		}
		for _, method := range []string{"GET", "PATCH", "DELETE"} {
			if r := request(method, "/api/collections/editorial_snapshots/records/"+first.Id, tokens["_superusers"], `{}`); r.Code < 400 {
				t.Fatal("snapshot exposed")
			}
		}
		r := request("GET", "/api/files/"+first.Collection().Id+"/"+first.Id+"/"+first.GetStringSlice("assets")[0], tokens["_superusers"], "")
		if r.Code < 400 {
			t.Fatal("general files exposed")
		}
		first.Set("slug", "tampered")
		if app.Save(first) == nil {
			t.Fatal("snapshot mutated")
		}
		if app.Delete(first) == nil {
			t.Fatal("snapshot deleted")
		}
		entry.Set("assets", []*filesystem.File{upload()})
		must(t, app.Save(entry))
		next, err := previous(app, "software", "tipbox")
		must(t, err)
		if next.Id == first.Id {
			t.Fatal("published save didn't revise")
		}
		must(t, app.Delete(entry))
		res := request("GET", assetPath, tokens["publishing_builds"], "")
		if res.Code != 200 || !bytes.Equal(res.Body.Bytes(), raw.Bytes()) {
			t.Fatalf("retained asset unavailable: %d", res.Code)
		}
		recreated := core.NewRecord(entries)
		recreated.Set("kind", "software")
		recreated.Set("slug", "tipbox")
		recreated.Set("data", map[string]any{"title": "Private"})
		must(t, app.Save(recreated))
		next, err = previous(app, "software", "tipbox")
		must(t, err)
		withdrawn, err := decode(next)
		must(t, err)
		if withdrawn.State != "unpublished" || len(withdrawn.Data) != 0 || len(withdrawn.Assets) != 0 {
			t.Fatal("withdrawal leaked data")
		}
	})
	t.Run("publication failure rolls back", func(t *testing.T) {
		invalid := core.NewRecord(entries)
		invalid.Set("kind", "blog")
		invalid.Set("slug", "bad-file")
		invalid.Set("data", map[string]any{"title": "Bad"})
		invalid.Set("published", true)
		file, err := filesystem.NewFileFromBytes(raw.Bytes(), "mismatch.pdf")
		must(t, err)
		invalid.Set("assets", []*filesystem.File{file})
		if app.Save(invalid) == nil {
			t.Fatal("accepted mismatched extension")
		}
		prev, err := previous(app, "blog", "bad-file")
		must(t, err)
		if prev != nil {
			t.Fatal("failed save created a snapshot")
		}
		if _, err := app.FindRecordById("editorial_entries", invalid.Id); err == nil {
			t.Fatal("failed publication committed working record")
		}
	})
	t.Run("Likes snapshot coherence", func(t *testing.T) {
		item := core.NewRecord(items)
		item.Set("title", "Published title")
		item.Set("asset", upload())
		item.Set("collections", []string{group.Id})
		item.Set("previewProvenance", map[string]any{"secret": "not public"})
		item.Set("published", true)
		must(t, app.Save(item))
		snapshot, err := previous(app, "like", item.Id)
		must(t, err)
		pub, err := decode(snapshot)
		must(t, err)
		if _, ok := pub.Data["previewProvenance"]; ok {
			t.Fatal("provenance leaked")
		}
		// Deleting the working item retains publication. A group rename must use
		// the snapshot, not require a working record or mutable asset.
		must(t, app.Delete(item))
		group.Set("name", "Renamed")
		must(t, app.Save(group))
		snapshot, err = previous(app, "like", item.Id)
		must(t, err)
		renamed, err := decode(snapshot)
		must(t, err)
		if renamed.Revision == pub.Revision || renamed.Data["title"] != "Published title" || !strings.Contains(snapshot.GetString("payload"), "Renamed") {
			t.Fatal("rename not coherent")
		}
		if renamed.Assets[0].Name != pub.Assets[0].Name || renamed.Assets[0].SHA256 != pub.Assets[0].SHA256 {
			t.Fatal("rename changed asset mapping")
		}
		must(t, app.Delete(group))
		snapshot, err = previous(app, "like", item.Id)
		must(t, err)
		deleted, err := decode(snapshot)
		must(t, err)
		if len(deleted.Data["collections"].([]any)) != 0 {
			t.Fatal("deleted collection retained")
		}
		// A draft-only named collection is never emitted, nor does its rename
		// publish private item fields or memberships.
		privateGroup := core.NewRecord(groups)
		privateGroup.Set("name", "Private group")
		must(t, app.Save(privateGroup))
		draft := core.NewRecord(items)
		draft.Set("type", "note")
		draft.Set("body", "Secret note")
		draft.Set("collections", []string{privateGroup.Id})
		must(t, app.Save(draft))
		privateGroup.Set("name", "Secret renamed group")
		must(t, app.Save(privateGroup))
		encoded, err := json.Marshal(content())
		must(t, err)
		if strings.Contains(string(encoded), "Secret") {
			t.Fatal("draft names or edits leaked")
		}
		// Membership changes on Published Save resolve names coherently.
		legacy.Set("collections", []string{privateGroup.Id})
		must(t, app.Save(legacy))
		membership, err := previous(app, "like", legacy.Id)
		must(t, err)
		if !strings.Contains(membership.GetString("payload"), "Secret renamed group") {
			t.Fatal("published membership absent")
		}
		// Turning Published off emits a tombstone and later private saves emit nothing.
		legacy.Set("published", false)
		must(t, app.Save(legacy))
		snapshot, err = previous(app, "like", legacy.Id)
		must(t, err)
		legacy.Set("title", "Private changes")
		must(t, app.Save(legacy))
		after, err := previous(app, "like", legacy.Id)
		must(t, err)
		if after.Id != snapshot.Id || strings.Contains(after.GetString("payload"), "Private") {
			t.Fatal("draft save leaked")
		}
	})
}

func TestLikesDeleteGuard(t *testing.T) {
	for _, scenario := range []struct {
		name      string
		migrated  bool
		published bool
		seeded    bool
	}{
		{"unseeded published", true, true, false},
		{"seeded published", true, true, true},
		{"draft", true, false, false},
		{"unmigrated published", false, true, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			// JS migrations register globally, and NewTestApp applies them.
			// Isolate fixtures before bootstrap, especially the pre-editorial DB.
			registered := core.AppMigrations
			core.AppMigrations = core.MigrationsList{}
			t.Cleanup(func() { core.AppMigrations = registered })
			app, err := tests.NewTestApp(t.TempDir())
			must(t, err)
			defer app.Cleanup()
			migrations, err := filepath.Abs("../../pb_migrations")
			must(t, err)
			fixtureMigrations := t.TempDir()
			entries, err := os.ReadDir(migrations)
			must(t, err)
			for _, entry := range entries {
				if entry.IsDir() || entry.Name() < "1781568000_" || !strings.HasSuffix(entry.Name(), ".js") || (!scenario.migrated && entry.Name() == "1782432000_editorial.js") {
					continue
				}
				data, err := os.ReadFile(filepath.Join(migrations, entry.Name()))
				must(t, err)
				must(t, os.WriteFile(filepath.Join(fixtureMigrations, entry.Name()), data, 0600))
			}
			hooks, err := filepath.Abs("../../pb_hooks")
			must(t, err)
			jsvm.MustRegister(app, jsvm.Config{MigrationsDir: fixtureMigrations, HooksDir: hooks})
			must(t, app.RunAppMigrations())
			if !scenario.migrated {
				if _, err := app.FindCollectionByNameOrId(snapshots); !errors.Is(err, sql.ErrNoRows) {
					t.Fatalf("expected pre-editorial schema: %v", err)
				}
			}
			items, err := app.FindCollectionByNameOrId("likes_items")
			must(t, err)
			var raw bytes.Buffer
			must(t, png.Encode(&raw, image.NewRGBA(image.Rect(0, 0, 2, 2))))
			file, err := filesystem.NewFileFromBytes(raw.Bytes(), "legacy.png")
			must(t, err)
			item := core.NewRecord(items)
			item.Set("title", "Legacy media")
			item.Set("asset", file)
			item.Set("published", scenario.published)
			must(t, app.Save(item))
			workingPath := filepath.Join(app.DataDir(), "storage", item.BaseFilesPath(), item.GetString("asset"))
			assertFile := func(name string) {
				t.Helper()
				data, err := os.ReadFile(name)
				must(t, err)
				if !bytes.Equal(data, raw.Bytes()) {
					t.Fatal("media bytes changed")
				}
			}
			assertFile(workingPath)
			Register(app)
			var before *core.Record
			if scenario.seeded {
				must(t, SeedLikes(app))
				before, err = previous(app, "like", item.Id)
				must(t, err)
				if before == nil {
					t.Fatal("seed did not retain publication")
				}
			}
			// Unsaved caller edits must not bypass the persisted publication guard.
			item.Set("published", false)
			err = app.Delete(item)
			if scenario.migrated && scenario.published && !scenario.seeded {
				if err == nil || !strings.Contains(err.Error(), "editorial-seed-likes") {
					t.Errorf("unseeded published Like deletion must require explicit editorial-seed-likes; got %v", err)
				}
				persisted, err := app.FindRecordById("likes_items", item.Id)
				if err != nil {
					t.Errorf("rejected deletion lost working record: %v", err)
				} else if !persisted.GetBool("published") {
					t.Error("rejected deletion changed publication flag")
				}
				rows, err := latest(app)
				must(t, err)
				if len(rows) != 0 {
					t.Error("delete silently seeded publication")
				}
				if requireSeededLikes(app, rows) == nil {
					t.Error("deletion bypassed fail-closed content check")
				}
				assertFile(workingPath)
				return
			}
			must(t, err)
			if _, err := app.FindRecordById("likes_items", item.Id); !errors.Is(err, sql.ErrNoRows) {
				t.Fatalf("working record not deleted: %v", err)
			}
			if scenario.migrated {
				rows, err := latest(app)
				must(t, err)
				must(t, requireSeededLikes(app, rows))
				if scenario.seeded {
					if len(rows) != 1 || rows[0].Id != before.Id || rows[0].GetString("payload") != before.GetString("payload") {
						t.Fatal("delete changed retained publication")
					}
					assertFile(filepath.Join(app.DataDir(), "storage", before.BaseFilesPath(), before.GetStringSlice("assets")[0]))
				} else if len(rows) != 0 {
					t.Fatal("draft deletion published content")
				}
			}
		})
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
