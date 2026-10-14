package main

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	_ "github.com/pocketbase/pocketbase/migrations" // Test fixture initialization only.
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func approved() release {
	return release{"Watery Grave EP", "Miracle Fortress", "2005", "Winter 2005, Self Released", "A self-released EP from winter 2005.", "/images/music-releases/watery-grave.jpg", append([]track(nil), approvedTracks...)}
}

func TestDecode(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*release)
	}{
		{"approved", func(v *release) {}},
		{"wrong metadata", func(v *release) { v.Artist = "Other" }},
		{"missing track", func(v *release) { v.Tracks = v.Tracks[:4] }},
		{"reordered", func(v *release) { v.Tracks[0], v.Tracks[1] = v.Tracks[1], v.Tracks[0] }},
		{"duplicate order", func(v *release) { v.Tracks[1].Number = 1 }},
		{"external audio", func(v *release) { v.Tracks[0].Audio = "https://example.com/audio.mp3" }},
		{"query string", func(v *release) { v.Tracks[0].Audio += "?x=1" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v := approved()
			tc.change(&v)
			raw, _ := json.Marshal(v)
			_, err := decode(bytes.NewReader(raw))
			if (err == nil) != (tc.name == "approved") {
				t.Fatal("unexpected validation result")
			}
		})
	}
	raw, _ := json.Marshal(approved())
	for _, bad := range [][]byte{append(append([]byte(nil), raw...), raw...), []byte(`[]`), append([]byte(`{"publish":true,`), raw[1:]...)} {
		if _, err := decode(bytes.NewReader(bad)); err == nil {
			t.Fatal("accepted invalid document")
		}
	}
}

func TestMissingDBDoesNotCreateDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "absent")
	if existingDB(dir) == nil {
		t.Fatal("accepted missing database")
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("created directory")
	}
	if _, err := run([]string{"--dir", "sensitive"}); err == nil {
		t.Fatal("accepted missing flags")
	}
}

func fixture(t *testing.T) core.App {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ClearBootstrap() })
	r := core.NewBaseCollection("publishing_releases")
	for _, name := range []string{"slug", "title", "artist", "release_date", "display_date", "about"} {
		r.Fields.Add(&core.TextField{Name: name, Required: true})
	}
	r.Fields.Add(&core.BoolField{Name: "published"}, &core.JSONField{Name: "tracks"}, &core.FileField{Name: "artwork", Protected: true, MaxSelect: 1})
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	snapshots := core.NewBaseCollection("publishing_snapshots")
	snapshots.Fields.Add(&core.TextField{Name: "slug"}, &core.NumberField{Name: "sequence"}, &core.JSONField{Name: "payload"}, &core.FileField{Name: "artwork", MaxSelect: 1})
	if err := app.Save(snapshots); err != nil {
		t.Fatal(err)
	}
	return app
}

func TestSaveDraft(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "import-release")
	if output, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %s: %v", output, err)
	}
	for _, scenario := range []string{"success", "release collision", "snapshot collision", "release failure", "legacy schema", "wrong tracks type"} {
		t.Run(scenario, func(t *testing.T) {
			app := fixture(t)
			var imageBytes bytes.Buffer
			if err := png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
				t.Fatal(err)
			}
			art, err := filesystem.NewFileFromBytes(imageBytes.Bytes(), "art.png")
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "release collision" {
				if _, err := saveDraft(app, approved(), art); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "snapshot collision" {
				c, _ := app.FindCollectionByNameOrId("publishing_snapshots")
				r := core.NewRecord(c)
				r.Set("slug", slug)
				if err := app.Save(r); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "release failure" {
				c, _ := app.FindCollectionByNameOrId("publishing_releases")
				c.Fields.Add(&core.TextField{Name: "required_extra", Required: true})
				if err := app.Save(c); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "legacy schema" || scenario == "wrong tracks type" {
				c, _ := app.FindCollectionByNameOrId("publishing_releases")
				c.Fields.RemoveByName("tracks")
				if scenario == "legacy schema" {
					c.Fields.RemoveByName("published")
					c.Fields.Add(&core.BoolField{Name: "publish"}, &core.BoolField{Name: "unpublish"})
				} else {
					c.Fields.Add(&core.TextField{Name: "tracks"})
				}
				if err := app.Save(c); err != nil {
					t.Fatal(err)
				}
			}
			before, _ := app.CountRecords("publishing_releases")
			input := t.TempDir()
			raw, _ := json.Marshal(approved())
			if err := os.WriteFile(filepath.Join(input, "release.json"), raw, 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(input, "art.png"), imageBytes.Bytes(), 0600); err != nil {
				t.Fatal(err)
			}
			app.ClearBootstrap()
			output, err := exec.Command(binary, "--dir", app.DataDir(), "--release", filepath.Join(input, "release.json"), "--artwork", filepath.Join(input, "art.png")).CombinedOutput()
			if bootErr := app.Bootstrap(); bootErr != nil {
				t.Fatal(bootErr)
			}
			if scenario != "success" {
				if err == nil || string(output) != "Import failed.\n" {
					t.Fatalf("expected sanitized refusal: %q: %v", output, err)
				}
				after, _ := app.CountRecords("publishing_releases")
				if before != after {
					t.Fatal("release not rolled back")
				}
				return
			}
			if err != nil {
				t.Fatalf("CLI failed: %s: %v", output, err)
			}
			r, err := app.FindFirstRecordByData("publishing_releases", "slug", slug)
			if err != nil {
				t.Fatal(err)
			}
			if string(output) != "Imported record "+r.Id+"; tracks=5\n" {
				t.Fatalf("unexpected output: %q", output)
			}
			if count, err := app.CountRecords("publishing_releases"); err != nil || count != 1 {
				t.Fatal("expected exactly one release", err)
			}
			if r.GetBool("published") || r.GetString("artwork") == "" || r.GetString("about") != approved().About {
				t.Fatal("incorrect draft")
			}
			var rows []track
			if err := r.UnmarshalJSONField("tracks", &rows); err != nil || !reflect.DeepEqual(rows, approvedTracks) {
				t.Fatal("incorrect JSON tracks", err)
			}
			if _, err := app.FindCollectionByNameOrId("publishing_tracks"); err == nil {
				t.Fatal("created track collection")
			}
			n, _ := app.CountRecords("publishing_snapshots")
			if n != 0 {
				t.Fatal("created snapshot")
			}
		})
	}
}
