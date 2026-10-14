package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const secret = "NEVER_EMIT_PRIVATE_SECRET"
const privateMetadata = `{"Metadata":{"originalName":"NEVER_EMIT_PRIVATE_METADATA"}}`

func fixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(dir, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`CREATE TABLE _collections (id TEXT PRIMARY KEY, name TEXT, type TEXT, fields JSON, options JSON, listRule TEXT, viewRule TEXT, createRule TEXT, updateRule TEXT, deleteRule TEXT, system BOOLEAN, indexes JSON, created TEXT, updated TEXT)`)
	exec(`CREATE TABLE _params (id TEXT PRIMARY KEY, value JSON, created TEXT, updated TEXT)`)
	exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, photo TEXT, attachments JSON, content TEXT)`)
	exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY)`)
	exec(`INSERT INTO _collections VALUES ('col_assets','assets','base',?, '{}',NULL,'',?,NULL,NULL,0,'[]','','')`,
		`[{"name":"id","type":"text"},{"name":"photo","type":"file","maxSelect":1,"protected":true},{"name":"attachments","type":"file","maxSelect":5,"protected":false}]`, secret)
	exec(`INSERT INTO _collections VALUES ('col_accounts','accounts','auth','[{"name":"id","type":"text"}]',?,NULL,NULL,NULL,NULL,NULL,0,'[]','','')`,
		`{"mfa":{"enabled":true,"rule":"`+secret+`"},"authRule":"","manageRule":null,"authToken":{"secret":"`+secret+`"}}`)
	exec(`INSERT INTO _params VALUES ('settings',?,'','')`, `{"s3":{"enabled":true,"region":"us-west-2","accessKey":"`+secret+`","secret":"`+secret+`","bucket":"`+secret+`"},"smtp":{"password":"`+secret+`"},"backups":{"s3":{"enabled":false,"secret":"`+secret+`"}}}`)
	exec(`INSERT INTO assets VALUES ('private_record', 'private_photo.jpg', '["private_doc.pdf","private_missing.pdf","private_photo.jpg"]',?)`, secret)
	exec(`INSERT INTO assets VALUES ('empty_record', '', '[]',?)`, secret)
	exec(`INSERT INTO accounts VALUES ('private_account')`)
	put(t, dir, "col_assets/private_record/private_photo.jpg", "photo")
	put(t, dir, "col_assets/private_record/private_doc.pdf", "document")
	put(t, dir, "col_assets/private_record/thumbs_private_photo.jpg/100x100.jpg", "thumb")
	put(t, dir, "col_assets/private_record/orphan.jpg", "orphan")
	put(t, dir, "col_assets/private_record/thumbs_orphan.jpg/100x100.jpg", "orphan thumb")
	put(t, dir, "col_assets/private_record/private_photo.jpg.attrs", privateMetadata)
	put(t, dir, "col_assets/private_record/thumbs_private_photo.jpg/100x100.jpg.attrs", privateMetadata)
	put(t, dir, "col_assets/private_record/orphan.jpg.attrs", privateMetadata)
	put(t, dir, "col_assets/private_record/thumbs_orphan.jpg/100x100.jpg.attrs", privateMetadata)
	put(t, dir, "unknown_collection/private_record/file", "unknown")
	return dir
}
func put(t *testing.T, dir, path, value string) {
	t.Helper()
	path = filepath.Join(dir, "storage", path)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(value), 0600); err != nil {
		t.Fatal(err)
	}
}
func change(t *testing.T, dir, q string, args ...any) {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(dir, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(q, args...); err != nil {
		t.Fatal(err)
	}
}
func inventory(t *testing.T, dir string) map[string][32]byte {
	t.Helper()
	result := map[string][32]byte{}
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		result[strings.TrimPrefix(path, dir)] = sha256.Sum256(b)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func TestInventoryAndSanitization(t *testing.T) {
	dir := fixture(t)
	before := inventory(t, dir)
	r, err := inspect(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(r.Filesystem, "not atomically") {
		t.Fatal("missing live warning")
	}
	if r.Settings.Unknown || r.Settings.S3 == nil || !*r.Settings.S3 || r.Settings.Region != "us-west-2" || *r.Settings.BackupS3 {
		t.Fatalf("settings: %+v", r.Settings)
	}
	auth, c := r.Collections[0], r.Collections[1]
	if auth.MFA == nil || !*auth.MFA || auth.Rules["authRule"] != "public" || auth.Rules["manageRule"] != "locked" {
		t.Fatal("auth metadata")
	}
	if c.Records != 2 || c.References != 3 || c.Missing != 1 || c.Originals != (totals{2, 13}) || c.Thumbnails != (totals{1, 5}) || c.Unreferenced != (totals{4, 18 + 2*int64(len(privateMetadata))}) {
		t.Fatalf("inventory: %+v", c)
	}
	if c.MetadataSidecars != (totals{2, 2 * int64(len(privateMetadata))}) {
		t.Fatalf("metadata totals: %+v", c.MetadataSidecars)
	}
	if len(c.Fields) != 2 || !c.Fields[0].Protected || c.Fields[1].MaxSelect != 5 || c.Rules["list"] != "locked" || c.Rules["view"] != "public" || c.Rules["create"] != "conditional" {
		t.Fatal("schema metadata")
	}
	if r.Unattributed != (totals{1, 7}) {
		t.Fatal("unattributed")
	}
	var out bytes.Buffer
	if run([]string{"--data-dir", dir}, &out) != 0 {
		t.Fatal(out.String())
	}
	for _, forbidden := range []string{secret, "NEVER_EMIT_PRIVATE_METADATA", "originalName", ".attrs", "private_record", "private_photo", "private_doc", "private_missing", "private_account", "empty_record", "orphan.jpg", "unknown_collection", dir} {
		if strings.Contains(out.String(), forbidden) {
			t.Fatalf("output leaked %s", forbidden)
		}
	}
	var emitted report
	if json.Unmarshal(out.Bytes(), &emitted) != nil || emitted.Collections[1].MetadataSidecars != c.MetadataSidecars {
		t.Fatal("missing JSON metadata totals")
	}
	after := inventory(t, dir)
	if len(before) != len(after) {
		t.Fatal("files created/deleted")
	}
	for p, sum := range before {
		if after[p] != sum {
			t.Fatal("file changed")
		}
	}
	again, err := inspect(dir)
	if err != nil || again.Collections[1].Digest != c.Digest {
		t.Fatal("unstable digest")
	}
	change(t, dir, `UPDATE assets SET attachments='["private_photo.jpg","private_missing.pdf","private_doc.pdf"]' WHERE id='private_record'`)
	reordered, err := inspect(dir)
	if err != nil || reordered.Collections[1].Digest != c.Digest {
		t.Fatal("digest depends on field array order")
	}
	// Neither metadata contents (even invalid metadata) nor thumbnail data
	// participate in the original-only digest.
	put(t, dir, "col_assets/private_record/private_photo.jpg.attrs", "invalid metadata")
	put(t, dir, "col_assets/private_record/thumbs_private_photo.jpg/100x100.jpg.attrs", "also invalid")
	put(t, dir, "col_assets/private_record/thumbs_private_photo.jpg/100x100.jpg", "changed thumb")
	metadataChanged, err := inspect(dir)
	if err != nil || metadataChanged.Collections[1].Digest != c.Digest {
		t.Fatal("digest depends on metadata or thumbnails")
	}
	put(t, dir, "col_assets/private_record/private_photo.jpg", "changed")
	changed, err := inspect(dir)
	if err != nil || changed.Collections[1].Digest == c.Digest {
		t.Fatal("content absent from digest")
	}
}
func TestSidecarAssociationAndExplicitOriginalPrecedence(t *testing.T) {
	dir := fixture(t)
	// A reference associates metadata even when the local original or thumb
	// is missing. No full metadata/data integrity claim is made.
	put(t, dir, "col_assets/private_record/private_missing.pdf.attrs", privateMetadata)
	put(t, dir, "col_assets/private_record/thumbs_private_missing.pdf/100x100.jpg.attrs", privateMetadata)
	before, err := inspect(dir)
	if err != nil {
		t.Fatal(err)
	}
	c := before.Collections[1]
	if c.MetadataSidecars != (totals{4, 4 * int64(len(privateMetadata))}) || c.Missing != 1 || c.Thumbnails != (totals{1, 5}) {
		t.Fatalf("missing data association: %+v", c)
	}
	// This path matches an existing original's sidecar name, but an explicit
	// file-field reference must make it an original (including in the digest).
	put(t, dir, "col_assets/private_record/private_photo.jpg.attrs.attrs", privateMetadata)
	change(t, dir, `UPDATE assets SET attachments='["private_doc.pdf","private_missing.pdf","private_photo.jpg","private_photo.jpg.attrs"]' WHERE id='private_record'`)
	r, err := inspect(dir)
	if err != nil {
		t.Fatal(err)
	}
	c = r.Collections[1]
	if c.Originals != (totals{3, 13 + int64(len(privateMetadata))}) || c.MetadataSidecars != (totals{4, 4 * int64(len(privateMetadata))}) || c.Missing != 1 {
		t.Fatalf("explicit reference precedence: %+v", c)
	}
	put(t, dir, "col_assets/private_record/private_photo.jpg.attrs", "changed explicit original")
	changed, err := inspect(dir)
	if err != nil || changed.Collections[1].Digest == c.Digest {
		t.Fatal("explicit .attrs original not hashed")
	}
}

func TestViewInventoryUsesSourceCollections(t *testing.T) {
	dir := fixture(t)
	put(t, dir, "col_assets/private_record/private_missing.pdf", "present")
	before, err := inspect(dir)
	if err != nil {
		t.Fatal(err)
	}
	change(t, dir, `CREATE VIEW asset_view AS
		SELECT 'different_' || id AS id, photo, attachments FROM assets
		UNION ALL SELECT NULL, NULL, NULL`)
	change(t, dir, `INSERT INTO _collections
		SELECT 'col_view','asset_view','view',fields,'{}',listRule,viewRule,
		createRule,updateRule,deleteRule,system,indexes,created,updated
		FROM _collections WHERE id='col_assets'`)
	r, err := inspect(dir)
	if err != nil {
		t.Fatal(err)
	}
	view := r.Collections[2]
	if view.Type != "view" || view.Records != 3 || len(view.Fields) != 2 || !view.Fields[0].Protected || view.Fields[1].MaxSelect != 5 || view.FileInventory != "source-collections-only" {
		t.Fatalf("view metadata: %+v", view)
	}
	if view.References != 0 || view.Missing != 0 || view.Originals != (totals{}) || view.Thumbnails != (totals{}) || view.MetadataSidecars != (totals{}) || view.Unreferenced != (totals{}) || view.Digest != "" {
		t.Fatalf("view has physical inventory: %+v", view)
	}
	var refs, missing int
	for _, c := range r.Collections {
		refs += c.References
		missing += c.Missing
	}
	if refs != 3 || missing != 0 || r.Collections[1].Digest != before.Collections[1].Digest || r.Collections[1].Originals != before.Collections[1].Originals {
		t.Fatal("view duplicated or changed source inventory")
	}
	b, err := json.Marshal(view)
	if err != nil || !bytes.Contains(b, []byte(`"fileInventory":"source-collections-only"`)) {
		t.Fatal("view exclusion not reported")
	}
	change(t, dir, `DROP VIEW asset_view`)
	assertFailure(t, dir)
}

func TestSettingsUnknown(t *testing.T) {
	for _, raw := range []string{"encrypted-base64-" + secret, `null`, `{}`, `{"s3":{"enabled":"secret"}}`} {
		t.Run(raw[:min(len(raw), 12)], func(t *testing.T) {
			dir := fixture(t)
			change(t, dir, `UPDATE _params SET value=?`, raw)
			r, err := inspect(dir)
			if err != nil || !r.Settings.Unknown || r.Settings.S3 != nil || r.Settings.BackupS3 != nil {
				t.Fatal("settings not unknown")
			}
		})
	}
	s := parseSettings(`{"s3":{"enabled":false,"region":"` + secret + `"},"backups":{"s3":{"enabled":true}}}`)
	if s.Unknown || s.Region != "" || s.BackupS3 == nil || !*s.BackupS3 {
		t.Fatal("unsafe region")
	}
}
func assertFailure(t *testing.T, dir string) {
	t.Helper()
	var out bytes.Buffer
	if run([]string{"--data-dir", dir}, &out) != 1 || out.String() != "{\"error\":\"inspection_failed\"}\n" {
		t.Fatalf("expected sanitized failure: %s", out.String())
	}
}
func TestFailClosedSchema(t *testing.T) {
	for _, q := range []string{
		`DROP TABLE _collections`, `DROP TABLE _params`, `ALTER TABLE _collections RENAME COLUMN fields TO schema`,
		`UPDATE _collections SET fields='null'`, `UPDATE _collections SET fields='[{"name":"f","type":"future"}]'`,
		`UPDATE _collections SET fields='[{"name":"f","type":"file"}]'`, `UPDATE _collections SET type='future'`,
		`UPDATE _collections SET options='{}' WHERE type='auth'`, `DROP TABLE assets`,
		`ALTER TABLE assets DROP COLUMN photo`, `ALTER TABLE assets RENAME COLUMN id TO missing_id`,
		`UPDATE assets SET attachments='[1]'`, `DELETE FROM _params`,
	} {
		t.Run(q, func(t *testing.T) { dir := fixture(t); change(t, dir, q); assertFailure(t, dir) })
	}
	assertFailure(t, t.TempDir())
}
func TestTraversal(t *testing.T) {
	for _, value := range []string{"../" + secret, "/etc/passwd", `..\secret`, ".", "..", "bad\x00name"} {
		for _, column := range []string{"id", "photo", "attachments"} {
			t.Run(column+value, func(t *testing.T) {
				dir := fixture(t)
				v := value
				if column == "attachments" {
					b, _ := json.Marshal([]string{value})
					v = string(b)
				}
				change(t, dir, "UPDATE assets SET "+quote(column)+"=? WHERE id='private_record'", v)
				assertFailure(t, dir)
			})
		}
	}
}
func TestSymlinks(t *testing.T) {
	for _, path := range []string{"data.db", "data.db-wal", "data.db-shm", "data.db-journal", "storage", "storage/col_assets", "storage/col_assets/private_record", "storage/col_assets/private_record/private_photo.jpg", "storage/col_assets/private_record/private_photo.jpg.attrs", "storage/col_assets/private_record/thumbs_private_photo.jpg/100x100.jpg.attrs", "storage/col_assets/private_record/extra"} {
		t.Run(path, func(t *testing.T) {
			dir := fixture(t)
			target := filepath.Join(dir, path)
			if err := os.RemoveAll(target); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(t.TempDir(), target); err != nil {
				t.Fatal(err)
			}
			assertFailure(t, dir)
		})
	}
	dir := fixture(t)
	link := filepath.Join(t.TempDir(), "data-link")
	if err := os.Symlink(dir, link); err != nil {
		t.Fatal(err)
	}
	assertFailure(t, link)
}
func TestMissingStorageAndZeroMaxSelect(t *testing.T) {
	dir := fixture(t)
	if err := os.RemoveAll(filepath.Join(dir, "storage")); err != nil {
		t.Fatal(err)
	}
	change(t, dir, `UPDATE _collections SET fields=replace(fields,'"maxSelect":1','"maxSelect":0')`)
	r, err := inspect(dir)
	if err != nil {
		t.Fatal(err)
	}
	c := r.Collections[1]
	if c.Missing != 3 || c.Originals.Count != 0 {
		t.Fatal("missing storage not counted")
	}
}

// Separate process: SQLite can reuse a writable WAL shm mapping if a writer is
// in the same process, which is not how this standalone CLI is used.
func TestCLIProcess(t *testing.T) {
	if dir := os.Getenv("STORAGE_PREFLIGHT_TEST_DIR"); dir != "" {
		os.Exit(run([]string{"--data-dir", dir}, os.Stdout))
	}
}
func TestWALReadOnly(t *testing.T) {
	dir := fixture(t)
	db, err := sql.Open("sqlite", filepath.Join(dir, "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO assets VALUES ('wal_record','','[]','private')`); err != nil {
		t.Fatal(err)
	}
	before := inventory(t, dir)
	cmd := exec.Command(os.Args[0], "-test.run=^TestCLIProcess$")
	cmd.Env = append(os.Environ(), "STORAGE_PREFLIGHT_TEST_DIR="+dir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("CLI: %v %s", err, out)
	}
	var r report
	if json.Unmarshal(out, &r) != nil || r.Collections[1].Records != 3 {
		t.Fatal("WAL record not read")
	}
	after := inventory(t, dir)
	if len(before) != len(after) {
		t.Fatal("WAL files created/deleted")
	}
	for path, sum := range before {
		if after[path] != sum {
			t.Fatalf("WAL file changed: %s", path)
		}
	}
}

func TestUsageDoesNotEchoArguments(t *testing.T) {
	var out bytes.Buffer
	if run([]string{"--" + secret}, &out) != 1 || strings.Contains(out.String(), secret) || !json.Valid(out.Bytes()) {
		t.Fatal("unsafe usage")
	}
}
