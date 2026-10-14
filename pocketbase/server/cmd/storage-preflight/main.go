// storage-preflight reads PocketBase 0.40.4 without importing or bootstrapping it.
// Schema references: migrations/1640988000_init.go, core/collection_model*.go,
// core/settings_model.go and core/field_file.go in the pinned PocketBase module.
package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"golang.org/x/sys/unix"
	_ "modernc.org/sqlite"
)

var invalid = errors.New("inspection_failed")
var identifier = regexp.MustCompile(`^[A-Za-z0-9_]+$`)
var region = regexp.MustCompile(`^(af|ap|ca|cn|eu|il|me|mx|sa|us)-(gov-|iso-|isob-)?(central|east|west|north|south|northeast|southeast|southwest)-[0-9]+$`)

type totals struct {
	Count int64 `json:"count"`
	Bytes int64 `json:"bytes"`
}
type fileField struct {
	Name      string `json:"name"`
	Protected bool   `json:"protected"`
	MaxSelect int    `json:"maxSelect"`
}
type collection struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Type             string            `json:"type"`
	Records          int64             `json:"records"`
	Fields           []fileField       `json:"fileFields"`
	Rules            map[string]string `json:"rules"`
	MFA              *bool             `json:"mfaEnabled,omitempty"`
	FileInventory    string            `json:"fileInventory,omitempty"`
	References       int               `json:"uniqueReferences"`
	Missing          int               `json:"missingReferences"`
	Originals        totals            `json:"referencedOriginals"`
	Thumbnails       totals            `json:"thumbnails"`
	MetadataSidecars totals            `json:"metadataSidecars"`
	Unreferenced     totals            `json:"unreferenced"`
	Digest           string            `json:"inventorySHA256"`
	refs             map[string]bool
	hashes           map[string][32]byte
}
type settings struct {
	Unknown  bool   `json:"encryptedOrUnknown"`
	S3       *bool  `json:"s3Enabled,omitempty"`
	Region   string `json:"s3Region,omitempty"`
	BackupS3 *bool  `json:"backupS3Enabled,omitempty"`
}
type report struct {
	Filesystem   string        `json:"filesystem"`
	Settings     settings      `json:"settings"`
	Collections  []*collection `json:"collections"`
	Unattributed totals        `json:"unattributedFiles"`
}

func main() { os.Exit(run(os.Args[1:], os.Stdout)) }
func run(args []string, out io.Writer) int {
	flags := flag.NewFlagSet("storage-preflight", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dir := flags.String("data-dir", "", "PocketBase data directory")
	if flags.Parse(args) != nil || *dir == "" || flags.NArg() != 0 {
		fmt.Fprintln(out, `{"error":"usage: storage-preflight --data-dir DIRECTORY"}`)
		return 1
	}
	r, err := inspect(*dir)
	if err != nil {
		fmt.Fprintln(out, `{"error":"inspection_failed"}`)
		return 1
	}
	if json.NewEncoder(out).Encode(r) != nil {
		return 1
	}
	return 0
}

// Open each component relative to an already-open directory. O_NOFOLLOW applies
// to every component, including during traversal races; special files are rejected.
func openChild(parent *os.File, name string, directory bool) (*os.File, error) {
	if !component(name) {
		return nil, invalid
	}
	flags := unix.O_RDONLY | unix.O_CLOEXEC | unix.O_NOFOLLOW | unix.O_NONBLOCK
	if directory {
		flags |= unix.O_DIRECTORY
	}
	fd, err := unix.Openat(int(parent.Fd()), name, flags, 0)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), name)
	st, err := f.Stat()
	if err != nil || (!st.IsDir() && !st.Mode().IsRegular()) {
		f.Close()
		return nil, invalid
	}
	return f, nil
}
func component(s string) bool {
	return s != "" && s != "." && s != ".." && !strings.ContainsAny(s, "/\\\x00") && !strings.ContainsAny(s, "\r\n\t")
}
func openDirectory(path string) (*os.File, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, invalid
	}
	f, err := os.Open("/")
	if err != nil {
		return nil, invalid
	}
	for _, p := range strings.Split(strings.TrimPrefix(abs, "/"), "/") {
		if p == "" {
			continue
		}
		next, e := openChild(f, p, true)
		f.Close()
		if e != nil {
			return nil, invalid
		}
		f = next
	}
	return f, nil
}

func inspect(dir string) (*report, error) {
	root, err := openDirectory(dir)
	if err != nil {
		return nil, invalid
	}
	defer root.Close()
	// Require ordinary DB/sidecar files, never symlinks.
	for _, name := range []string{"data.db", "data.db-wal", "data.db-shm", "data.db-journal"} {
		f, e := openChild(root, name, false)
		if errors.Is(e, os.ErrNotExist) && name != "data.db" {
			continue
		}
		if e != nil {
			return nil, invalid
		}
		st, e := f.Stat()
		f.Close()
		if e != nil || !st.Mode().IsRegular() {
			return nil, invalid
		}
	}
	// SQLite resolves the /proc fd symlink; the DB namespace must remain stable
	// while inspecting (including data.db, its sidecars, and directory ancestors).
	// readonly_shm prevents SQLite's Unix VFS from writing/creating WAL shared
	// memory even with mode=ro. Never use immutable=1: it would ignore live WAL.
	// Keep query scratch space in memory, including sorts in view collections.
	u := url.URL{Scheme: "file", Path: fmt.Sprintf("/proc/self/fd/%d/data.db", root.Fd())}
	db, err := sql.Open("sqlite", u.String()+"?mode=ro&readonly_shm=1&_pragma=query_only(1)&_pragma=trusted_schema(0)&_pragma=temp_store(2)")
	if err != nil {
		return nil, invalid
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	tx, err := db.BeginTx(context.Background(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, invalid
	}
	defer tx.Rollback()
	r := &report{Filesystem: "live inventory; not atomically consistent with database or other files", Collections: []*collection{}}
	if err := loadCollections(tx, r); err != nil {
		return nil, invalid
	}
	var raw string
	var created, updated string
	if tx.QueryRow(`SELECT value,created,updated FROM _params WHERE id='settings'`).Scan(&raw, &created, &updated) != nil {
		return nil, invalid
	}
	r.Settings = parseSettings(raw)
	for _, c := range r.Collections {
		if loadReferences(tx, c) != nil {
			return nil, invalid
		}
	}
	// Release the database snapshot before potentially slow filesystem hashing.
	if tx.Rollback() != nil {
		return nil, invalid
	}
	storage, err := openChild(root, "storage", true)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, invalid
	}
	if err == nil {
		defer storage.Close()
		byID := map[string]*collection{}
		for _, c := range r.Collections {
			if c.Type != "view" {
				byID[c.ID] = c
			}
		}
		if walk(storage, "", func(path string, f *os.File, size int64) error {
			parts := strings.Split(path, "/")
			c := byID[parts[0]]
			if c == nil {
				r.Unattributed.Count++
				r.Unattributed.Bytes += size
				return nil
			}
			if c.refs[path] {
				h := sha256.New()
				n, err := io.Copy(h, f)
				if err != nil || n != size {
					return invalid
				}
				var sum [32]byte
				copy(sum[:], h.Sum(nil))
				c.hashes[path] = sum
				c.Originals.Count++
				c.Originals.Bytes += n
			} else if strings.HasSuffix(path, ".attrs") && c.refs[strings.TrimSuffix(path, ".attrs")] {
				// Explicit original references above take precedence over the suffix.
				// Association only: never read or validate fileblob metadata contents.
				c.MetadataSidecars.Count++
				c.MetadataSidecars.Bytes += size
			} else if len(parts) == 4 && strings.HasPrefix(parts[2], "thumbs_") && c.refs[parts[0]+"/"+parts[1]+"/"+strings.TrimPrefix(parts[2], "thumbs_")] {
				if strings.HasSuffix(parts[3], ".attrs") {
					c.MetadataSidecars.Count++
					c.MetadataSidecars.Bytes += size
				} else {
					c.Thumbnails.Count++
					c.Thumbnails.Bytes += size
				}
			} else {
				c.Unreferenced.Count++
				c.Unreferenced.Bytes += size
			}
			return nil
		}) != nil {
			return nil, invalid
		}
	}
	for _, c := range r.Collections {
		if c.Type == "view" {
			continue
		}
		paths := make([]string, 0, len(c.refs))
		for p := range c.refs {
			paths = append(paths, p)
		}
		sort.Strings(paths)
		h := sha256.New()
		h.Write([]byte("storage-preflight-v1\x00"))
		for _, p := range paths {
			// Length framing, sorted full relative paths, presence byte, then SHA256 of
			// the original. Missing entries participate, so empty/missing differ.
			binary.Write(h, binary.BigEndian, uint64(len(p)))
			h.Write([]byte(p))
			sum, found := c.hashes[p]
			if found {
				h.Write([]byte{1})
				h.Write(sum[:])
			} else {
				h.Write([]byte{0})
				c.Missing++
			}
		}
		c.Digest = hex.EncodeToString(h.Sum(nil))
	}
	return r, nil
}

func classify(rule *string) string {
	if rule == nil {
		return "locked"
	}
	if *rule == "" {
		return "public"
	}
	return "conditional"
}

// Backticks avoid SQLite's double-quoted-string fallback for missing columns.
func quote(s string) string { return "`" + strings.ReplaceAll(s, "`", "``") + "`" }
func loadCollections(tx *sql.Tx, r *report) error {
	// Selecting all expected columns rejects the pre-0.23 schema. Do not infer or
	// migrate legacy shapes. Version compatibility is structural, not a version audit.
	rows, err := tx.Query(`SELECT id,name,type,fields,options,listRule,viewRule,createRule,updateRule,deleteRule,system,indexes,created,updated FROM _collections ORDER BY id`)
	if err != nil {
		return invalid
	}
	defer rows.Close()
	ids, names := map[string]bool{}, map[string]bool{}
	for rows.Next() {
		c := &collection{Fields: []fileField{}, Rules: map[string]string{}, refs: map[string]bool{}, hashes: map[string][32]byte{}}
		var fields, options string
		var rules [5]*string
		var unused [4]any
		if rows.Scan(&c.ID, &c.Name, &c.Type, &fields, &options, &rules[0], &rules[1], &rules[2], &rules[3], &rules[4], &unused[0], &unused[1], &unused[2], &unused[3]) != nil {
			return invalid
		}
		if !identifier.MatchString(c.ID) || !identifier.MatchString(c.Name) || ids[c.ID] || names[c.Name] {
			return invalid
		}
		ids[c.ID] = true
		names[c.Name] = true
		if c.Type != "base" && c.Type != "auth" && c.Type != "view" {
			return invalid
		}
		for i, key := range []string{"list", "view", "create", "update", "delete"} {
			c.Rules[key] = classify(rules[i])
		}
		var fs []struct {
			Name      string `json:"name"`
			Type      string `json:"type"`
			Protected *bool  `json:"protected"`
			MaxSelect *int   `json:"maxSelect"`
		}
		if json.Unmarshal([]byte(fields), &fs) != nil || fs == nil {
			return invalid
		}
		seen := map[string]bool{}
		for _, f := range fs {
			if !identifier.MatchString(f.Name) || seen[f.Name] {
				return invalid
			}
			seen[f.Name] = true
			switch f.Type {
			case "file":
				if f.Protected == nil || f.MaxSelect == nil || *f.MaxSelect < 0 {
					return invalid
				}
				c.Fields = append(c.Fields, fileField{f.Name, *f.Protected, *f.MaxSelect})
			case "text", "number", "bool", "email", "url", "editor", "date", "autodate", "select", "json", "relation", "password", "geoPoint":
			default:
				return invalid
			}
		}
		var opts map[string]json.RawMessage
		if json.Unmarshal([]byte(options), &opts) != nil || opts == nil {
			return invalid
		}
		if c.Type == "auth" {
			var mfa struct {
				Enabled *bool `json:"enabled"`
			}
			if json.Unmarshal(opts["mfa"], &mfa) != nil || mfa.Enabled == nil {
				return invalid
			}
			c.MFA = mfa.Enabled
			for _, key := range []string{"authRule", "manageRule"} {
				var rule *string
				if json.Unmarshal(opts[key], &rule) != nil {
					return invalid
				}
				c.Rules[key] = classify(rule)
			}
		}
		r.Collections = append(r.Collections, c)
	}
	if rows.Err() != nil || len(r.Collections) == 0 {
		return invalid
	}
	return nil
}
func loadReferences(tx *sql.Tx, c *collection) error {
	if c.Type == "view" {
		// PocketBase FindRecordByViewFile resolves files to source records;
		// view IDs and nullable file values are not physical storage references.
		c.FileInventory = "source-collections-only"
		return tx.QueryRow("SELECT COUNT(*) FROM " + quote(c.Name)).Scan(&c.Records)
	}
	columns := []string{quote("id")}
	for _, f := range c.Fields {
		columns = append(columns, quote(f.Name))
	}
	rows, err := tx.Query("SELECT " + strings.Join(columns, ",") + " FROM " + quote(c.Name))
	if err != nil {
		return invalid
	}
	defer rows.Close()
	for rows.Next() {
		values := make([]string, len(columns))
		dest := make([]any, len(columns))
		for i := range values {
			dest[i] = &values[i]
		}
		if rows.Scan(dest...) != nil {
			return invalid
		}
		c.Records++
		if !component(values[0]) {
			return invalid
		}
		for i, field := range c.Fields {
			value := values[i+1]
			var files []string
			if field.MaxSelect > 1 {
				if json.Unmarshal([]byte(value), &files) != nil || files == nil {
					return invalid
				}
			} else if value != "" {
				files = []string{value}
			}
			for _, name := range files {
				if !component(name) {
					return invalid
				}
				c.refs[c.ID+"/"+values[0]+"/"+name] = true
			}
		}
	}
	c.References = len(c.refs)
	return rows.Err()
}
func parseSettings(raw string) settings {
	var s struct {
		S3 *struct {
			Enabled *bool  `json:"enabled"`
			Region  string `json:"region"`
		} `json:"s3"`
		Backups *struct {
			S3 *struct {
				Enabled *bool `json:"enabled"`
			} `json:"s3"`
		} `json:"backups"`
	}
	if json.Unmarshal([]byte(raw), &s) != nil || s.S3 == nil || s.S3.Enabled == nil || s.Backups == nil || s.Backups.S3 == nil || s.Backups.S3.Enabled == nil {
		return settings{Unknown: true}
	}
	result := settings{S3: s.S3.Enabled, BackupS3: s.Backups.S3.Enabled}
	if region.MatchString(s.S3.Region) {
		result.Region = s.S3.Region
	}
	return result
}
func walk(dir *os.File, prefix string, visit func(string, *os.File, int64) error) error {
	entries, err := dir.ReadDir(-1)
	if err != nil {
		return invalid
	}
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 {
			return invalid
		}
		f, err := openChild(dir, entry.Name(), entry.IsDir())
		if err != nil {
			return invalid
		}
		st, err := f.Stat()
		if err != nil {
			f.Close()
			return invalid
		}
		path := prefix + entry.Name()
		if st.IsDir() {
			err = walk(f, path+"/", visit)
		} else {
			err = visit(path, f, st.Size())
		}
		f.Close()
		if err != nil {
			return invalid
		}
	}
	return nil
}
