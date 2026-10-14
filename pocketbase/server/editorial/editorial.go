// Package editorial retains immutable, build-only editorial projections.
package editorial

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const snapshots = "editorial_snapshots"
const maxFile = 10 << 20

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

type Asset struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}
type Payload struct {
	Revision string         `json:"revision"`
	Kind     string         `json:"kind"`
	Slug     string         `json:"slug"`
	State    string         `json:"state"`
	Data     map[string]any `json:"data"`
	Assets   []Asset        `json:"assets"`
}

func Register(app core.App) {
	deny := func(e *core.RecordRequestEvent) error {
		return e.ForbiddenError("Snapshots are internal and immutable.", nil)
	}
	app.OnRecordCreateRequest(snapshots).BindFunc(deny)
	app.OnRecordUpdateRequest(snapshots).BindFunc(deny)
	app.OnRecordDeleteRequest(snapshots).BindFunc(deny)
	app.OnRecordViewRequest(snapshots).BindFunc(deny)
	app.OnRecordsListRequest(snapshots).BindFunc(func(e *core.RecordsListRequestEvent) error { return e.ForbiddenError("Snapshots are internal.", nil) })
	app.OnFileDownloadRequest(snapshots).BindFunc(func(e *core.FileDownloadRequestEvent) error {
		return e.ForbiddenError("Use the build asset endpoint.", nil)
	})
	immutable := func(e *core.RecordEvent) error { return errors.New("editorial snapshots are immutable") }
	app.OnRecordUpdate(snapshots).BindFunc(immutable)
	app.OnRecordDelete(snapshots).BindFunc(immutable)
	app.OnRecordCreate("editorial_entries", "likes_items").BindFunc(save)
	app.OnRecordUpdate("editorial_entries", "likes_items").BindFunc(save)
	app.OnRecordDelete("likes_items").BindFunc(deleteLike)
	app.OnRecordUpdate("likes_collections").BindFunc(refreshCollections)
	app.OnRecordDelete("likes_collections").BindFunc(refreshCollections)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/publishing/editorial-identities", func(e *core.RequestEvent) error {
			e.Response.Header().Set("Cache-Control", "no-store")
			e.Response.Header().Set("Vary", "Authorization")
			if e.Auth == nil || !e.Auth.IsSuperuser() {
				return e.ForbiddenError("Superuser identity required.", nil)
			}
			rows, err := latest(e.App)
			if err != nil {
				return e.InternalServerError("Identity inventory unavailable.", nil)
			}
			result := []map[string]string{}
			for _, r := range rows {
				if r.GetString("kind") != "like" {
					result = append(result, map[string]string{"kind": r.GetString("kind"), "slug": r.GetString("slug")})
				}
			}
			return e.JSON(http.StatusOK, result)
		})
		e.Router.GET("/api/publishing/content", func(e *core.RequestEvent) error {
			if err := authorize(e); err != nil {
				return err
			}
			var records []*core.Record
			err := e.App.RunInTransaction(func(tx core.App) error {
				var err error
				records, err = latest(tx)
				if err != nil {
					return err
				}
				return requireSeededLikes(tx, records)
			})
			if err != nil {
				return e.InternalServerError("Publication unavailable.", nil)
			}
			result := make([]Payload, 0, len(records))
			for _, r := range records {
				p, err := decode(r)
				if err != nil {
					return e.InternalServerError("Invalid publication.", nil)
				}
				result = append(result, p)
			}
			return e.JSON(http.StatusOK, result)
		})
		e.Router.GET("/api/publishing/content-assets/{revision}/{filename}", func(e *core.RequestEvent) error {
			if err := authorize(e); err != nil {
				return err
			}
			r, err := e.App.FindRecordById(snapshots, e.Request.PathValue("revision"))
			if err != nil {
				return e.NotFoundError("Asset not found.", nil)
			}
			filename := e.Request.PathValue("filename")
			found := false
			for _, f := range r.GetStringSlice("assets") {
				if f == filename {
					found = true
				}
			}
			if !found {
				return e.NotFoundError("Asset not found.", nil)
			}
			fs, err := e.App.NewFilesystem()
			if err != nil {
				return err
			}
			defer fs.Close()
			return fs.Serve(e.Response, e.Request, r.BaseFilesPath()+"/"+filename, filename)
		})
		return e.Next()
	})
}

func authorize(e *core.RequestEvent) error {
	e.Response.Header().Set("Cache-Control", "no-store")
	e.Response.Header().Set("Vary", "Authorization")
	if e.Auth == nil || e.Auth.IsSuperuser() || e.Auth.Collection().Name != "publishing_builds" {
		return e.ForbiddenError("Build identity required.", nil)
	}
	return nil
}

func identity(r *core.Record) (string, string) {
	if r.Collection().Name == "likes_items" {
		return "like", r.Id
	}
	return r.GetString("kind"), r.GetString("slug")
}

// A legacy published Like has no independent media until explicitly seeded.
// Check persisted state and delete in the same transaction; caller-side edits
// must not bypass the guard or silently publish a snapshot during deletion.
func deleteLike(e *core.RecordEvent) error {
	if _, err := e.App.FindCollectionByNameOrId(snapshots); errors.Is(err, sql.ErrNoRows) {
		return e.Next()
	} else if err != nil {
		return err
	}
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		persisted, err := tx.FindRecordById("likes_items", e.Record.Id)
		if err != nil {
			return err
		}
		if persisted.GetBool("published") {
			prev, err := previous(tx, "like", persisted.Id)
			if err != nil {
				return err
			}
			if prev == nil {
				return apis.NewBadRequestError("Cannot delete an unseeded published Like: run explicit editorial-seed-likes rehearsal and seeding first to retain publication and media.", nil)
			}
		}
		return e.Next()
	})
}

func save(e *core.RecordEvent) error {
	// Hooks are registered before migrations. Do not intercept unrelated colliding
	// collections on an unmigrated database; the migration itself must refuse them.
	if _, err := e.App.FindCollectionByNameOrId(snapshots); errors.Is(err, sql.ErrNoRows) {
		return e.Next()
	} else if err != nil {
		return err
	}
	oldNames := e.Record.Original().GetStringSlice("assets")
	uploads := e.Record.GetUnsavedFiles("assets")
	if e.Record.Collection().Name == "editorial_entries" {
		kind, slug := identity(e.Record)
		if (kind != "software" && kind != "blog" && kind != "settings") || len(slug) > 100 || !slugPattern.MatchString(slug) {
			return apis.NewBadRequestError("Invalid editorial identity.", nil)
		}
		if !e.Record.IsNew() {
			persisted, err := e.App.FindRecordById("editorial_entries", e.Record.Id)
			if err != nil {
				return err
			}
			if persisted.GetString("slug") != slug || persisted.GetString("kind") != kind {
				return apis.NewBadRequestError("Kind and slug are immutable.", nil)
			}
		}
		var data map[string]any
		raw := e.Record.GetString("data")
		if len(raw) > 262144 || json.Unmarshal([]byte(raw), &data) != nil || data == nil {
			return apis.NewBadRequestError("Data must be a JSON object (maximum 256 KiB).", nil)
		}
	}
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		if err := e.Next(); err != nil {
			return err
		}
		if err := resolveAliases(tx, e.Record, oldNames, uploads); err != nil {
			return apis.NewBadRequestError("Invalid assetNames: aliases must resolve to uploaded files; ambiguous replacements require explicit mapping (or replace one file per Save).", err)
		}
		if e.Record.GetBool("published") {
			if err := publish(tx, e.Record); err != nil {
				return apis.NewBadRequestError("Publication requires complete supported assets within the file limits.", err)
			}
			return nil
		}
		// Also permits an explicitly recreated identity to withdraw retained content.
		kind, slug := identity(e.Record)
		prev, err := previous(tx, kind, slug)
		if err != nil {
			return err
		}
		if prev == nil {
			return nil
		}
		p, err := decode(prev)
		if err != nil {
			return err
		}
		if p.State != "published" {
			return nil
		}
		return store(tx, Payload{Kind: kind, Slug: slug, State: "unpublished", Data: map[string]any{}, Assets: []Asset{}}, nil, nil)
	})
}

// Resolve after native upload processing, then update only JSON inside the same
// transaction. A second model Save would recurse and create duplicate revisions.
func resolveAliases(app core.App, r *core.Record, oldNames []string, uploads []*filesystem.File) error {
	if r.Collection().Name != "editorial_entries" {
		return nil
	}
	var data map[string]any
	if err := json.Unmarshal([]byte(r.GetString("data")), &data); err != nil {
		return err
	}
	raw, exists := data["assetNames"]
	if !exists {
		return nil
	} // Initial importer draft and actual-name references.
	aliases, ok := raw.(map[string]any)
	if !ok {
		return errors.New("assetNames must be an object")
	}
	current, old := map[string]bool{}, map[string]bool{}
	for _, name := range r.GetStringSlice("assets") {
		current[name] = true
	}
	for _, name := range oldNames {
		old[name] = true
	}
	removed, added := map[string]bool{}, map[string]bool{}
	for name := range old {
		if !current[name] {
			removed[name] = true
		}
	}
	for name := range current {
		if !old[name] {
			added[name] = true
		}
	}
	replacements := map[string]string{}
	// Exact original upload names can disambiguate a multi-file replacement.
	for alias, value := range aliases {
		name, ok := value.(string)
		if !ok || name == "" {
			return errors.New("alias values must be filenames")
		}
		if current[name] {
			continue
		}
		if !removed[name] {
			return fmt.Errorf("unresolved alias %q", alias)
		}
		for _, upload := range uploads {
			if upload.OriginalName == alias && added[upload.Name] {
				if prior := replacements[name]; prior != "" && prior != upload.Name {
					return errors.New("conflicting replacement aliases")
				}
				replacements[name] = upload.Name
			}
		}
	}
	used := map[string]bool{}
	for before, after := range replacements {
		if used[after] {
			return errors.New("ambiguous replacement")
		}
		used[after] = true
		delete(removed, before)
		delete(added, after)
	}
	if len(removed) == 1 && len(added) == 1 {
		for before := range removed {
			for after := range added {
				replacements[before] = after
			}
		}
	}
	changed := false
	for alias, value := range aliases {
		name := value.(string)
		if current[name] {
			continue
		}
		next := replacements[name]
		if next == "" {
			return fmt.Errorf("unresolved or ambiguous alias %q", alias)
		}
		aliases[alias] = next
		changed = true
	}
	if !changed {
		return nil
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = app.DB().NewQuery("UPDATE editorial_entries SET data = {:data} WHERE id = {:id}").Bind(dbx.Params{"data": string(encoded), "id": r.Id}).Execute()
	if err == nil {
		r.Set("data", data)
	}
	return err
}

func previous(app core.App, kind, slug string) (*core.Record, error) {
	rows, err := app.FindRecordsByFilter(snapshots, "kind = {:kind} && slug = {:slug}", "-sequence", 1, 0, dbx.Params{"kind": kind, "slug": slug})
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return rows[0], nil
}
func decode(r *core.Record) (Payload, error) {
	var p Payload
	err := json.Unmarshal([]byte(r.GetString("payload")), &p)
	return p, err
}
func latest(app core.App) ([]*core.Record, error) {
	// One SQL statement: no mixed-time pagination while an owner is saving.
	rows, err := app.FindRecordsByFilter(snapshots, "", "-sequence", 0, 0)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	result := []*core.Record{}
	for _, r := range rows {
		key := r.GetString("kind") + "/" + r.GetString("slug")
		if !seen[key] {
			seen[key] = true
			result = append(result, r)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].GetString("kind")+"/"+result[i].GetString("slug") < result[j].GetString("kind")+"/"+result[j].GetString("slug")
	})
	return result, nil
}

func publish(app core.App, r *core.Record) error {
	kind, slug := identity(r)
	p := Payload{Kind: kind, Slug: slug, State: "published", Data: map[string]any{}, Assets: []Asset{}}
	names := r.GetStringSlice("assets")
	if kind == "like" {
		// Explicit allowlist: never copy previewProvenance or raw imported payloads.
		for _, key := range []string{"title", "url", "description", "commentary", "type", "body", "attribution", "created", "updated"} {
			p.Data[key] = r.GetString(key)
		}
		p.Data["id"] = r.Id
		groups := []map[string]string{}
		ids := r.GetStringSlice("collections")
		sort.Strings(ids)
		for _, id := range ids {
			c, err := app.FindRecordById("likes_collections", id)
			if err != nil {
				return err
			}
			groups = append(groups, map[string]string{"id": id, "name": c.GetString("name")})
		}
		p.Data["collections"] = groups
		names = []string{}
		if f := r.GetString("asset"); f != "" {
			names = append(names, f)
		}
		p.Data["asset"] = r.GetString("asset")
	} else if err := json.Unmarshal([]byte(r.GetString("data")), &p.Data); err != nil {
		return err
	}
	return store(app, p, r, names)
}

// store copies from source storage, never from URLs or working-record references.
// names are the stable names used by data; files receive independent PB storage names.
func store(app core.App, p Payload, source *core.Record, names []string) error {
	if len(names) > 32 {
		return errors.New("too many publication assets")
	}
	c, err := app.FindCollectionByNameOrId(snapshots)
	if err != nil {
		return err
	}
	r := core.NewRecord(c)
	r.Id = core.GenerateDefaultRandomId()
	p.Revision = r.Id
	files := []*filesystem.File{}
	oldAssets := p.Assets
	p.Assets = []Asset{}
	if len(names) > 0 {
		fs, err := app.NewFilesystem()
		if err != nil {
			return err
		}
		defer fs.Close()
		total := 0
		for i, name := range names {
			storageName := name
			if source.Collection().Name == snapshots {
				storageName = path.Base(oldAssets[i].Path)
			}
			if storageName != path.Base(storageName) {
				return errors.New("invalid asset filename")
			}
			reader, err := fs.GetReader(source.BaseFilesPath() + "/" + storageName)
			if err != nil {
				return err
			}
			raw, err := io.ReadAll(io.LimitReader(reader, maxFile+1))
			reader.Close()
			if err != nil {
				return err
			}
			total += len(raw)
			if len(raw) > maxFile || total > 64<<20 {
				return errors.New("publication assets exceed 10 MiB per file or 64 MiB total")
			}
			expected := map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf"}[strings.ToLower(path.Ext(name))]
			if expected == "" || http.DetectContentType(raw) != expected {
				return errors.New("asset extension and contents must match a supported image or PDF")
			}
			file, err := filesystem.NewFileFromBytes(raw, name)
			if err != nil {
				return err
			}
			files = append(files, file)
			sum := sha256.Sum256(raw)
			p.Assets = append(p.Assets, Asset{Name: name, Path: "/api/publishing/content-assets/" + r.Id + "/" + file.Name, SHA256: hex.EncodeToString(sum[:])})
		}
	}
	count, err := app.CountRecords(snapshots)
	if err != nil {
		return err
	}
	r.Set("kind", p.Kind)
	r.Set("slug", p.Slug)
	r.Set("sequence", count+1)
	r.Set("assets", files)
	r.Set("payload", p)
	return app.Save(r)
}

func refreshCollections(e *core.RecordEvent) error {
	if _, err := e.App.FindCollectionByNameOrId(snapshots); errors.Is(err, sql.ErrNoRows) {
		return e.Next()
	} else if err != nil {
		return err
	}
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		if err := e.Next(); err != nil {
			return err
		}
		rows, err := latest(tx)
		if err != nil {
			return err
		}
		for _, r := range rows {
			p, err := decode(r)
			if err != nil {
				return err
			}
			if p.Kind != "like" || p.State != "published" {
				continue
			}
			raw, _ := json.Marshal(p.Data["collections"])
			var groups []map[string]string
			if err := json.Unmarshal(raw, &groups); err != nil {
				return err
			}
			changed := false
			next := []map[string]string{}
			for _, group := range groups {
				if group["id"] == e.Record.Id {
					changed = true
					if e.Type == "delete" {
						continue
					}
					group["name"] = e.Record.GetString("name")
				}
				next = append(next, group)
			}
			if !changed {
				continue
			}
			p.Data["collections"] = next
			names := []string{}
			for _, a := range p.Assets {
				names = append(names, a.Name)
			}
			if err := store(tx, p, r, names); err != nil {
				return err
			}
		}
		return nil
	})
}

// Fail closed during cutover instead of presenting an incomplete legacy Likes set.
func requireSeededLikes(app core.App, records []*core.Record) error {
	seen := map[string]bool{}
	for _, r := range records {
		if r.GetString("kind") == "like" {
			seen[r.GetString("slug")] = true
		}
	}
	items, err := app.FindRecordsByFilter("likes_items", "published = true", "", 0, 0)
	if err != nil {
		return err
	}
	for _, item := range items {
		if !seen[item.Id] {
			return errors.New("existing published Likes require explicit editorial-seed-likes rehearsal and seeding")
		}
	}
	return nil
}

// SeedLikes is explicit and atomic. Existing identities (including withdrawals)
// are never overwritten; failures abort rather than silently dropping old Likes.
func SeedLikes(app core.App) error {
	return app.RunInTransaction(func(tx core.App) error {
		rows, err := tx.FindRecordsByFilter("likes_items", "published = true", "id", 0, 0)
		if err != nil {
			return err
		}
		for _, r := range rows {
			prev, err := previous(tx, "like", r.Id)
			if err != nil {
				return err
			}
			if prev != nil {
				continue
			}
			if err := publish(tx, r); err != nil {
				return fmt.Errorf("seed Like %s: %w", r.Id, err)
			}
		}
		return nil
	})
}
