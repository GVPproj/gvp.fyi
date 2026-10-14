// Custom PocketBase executable. Ship this binary together with the full existing
// pb_hooks and pb_migrations directories; do not replace the mounted pb_data.
package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/spf13/cobra"
	"gvp.fyi/pocketbase/server/duplicates"
	"gvp.fyi/pocketbase/server/editorial"
	"gvp.fyi/pocketbase/server/preview"
	"gvp.fyi/pocketbase/server/publishing"
)

func main() {
	// Keep the standard CLI version contract in sync with the pinned Go module.
	pocketbase.Version = "0.40.4"
	app := pocketbase.New()
	var hooksDir, migrationsDir, publicDir string
	var hooksWatch, automigrate, indexFallback bool
	var hooksPool int
	flags := app.RootCmd.PersistentFlags()
	flags.StringVar(&hooksDir, "hooksDir", "", "JS hooks directory (default: sibling of pb_data)")
	flags.StringVar(&migrationsDir, "migrationsDir", "", "JS migrations directory (default: sibling of pb_data)")
	flags.StringVar(&publicDir, "publicDir", filepath.Join(filepath.Dir(os.Args[0]), "pb_public"), "static files directory")
	flags.BoolVar(&hooksWatch, "hooksWatch", false, "restart on JS hook changes")
	flags.IntVar(&hooksPool, "hooksPool", 15, "prewarmed JS hook runtimes")
	flags.BoolVar(&automigrate, "automigrate", false, "generate migrations for dashboard schema changes")
	flags.BoolVar(&indexFallback, "indexFallback", true, "serve index.html for missing static paths")
	if err := app.RootCmd.ParseFlags(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
	jsvm.MustRegister(app, jsvm.Config{HooksDir: hooksDir, MigrationsDir: migrationsDir, HooksWatch: hooksWatch, HooksPoolSize: hooksPool})
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Dir: migrationsDir, TemplateLang: migratecmd.TemplateLangJS, Automigrate: automigrate})
	preview.NewAPI(preview.NewFetcher(preview.Network{})).Register(app)
	duplicates.Register(app)
	publishing.Register(app)
	editorial.Register(app)
	app.RootCmd.AddCommand(&cobra.Command{
		Use: "editorial-seed-likes", Short: "Explicitly seed retained snapshots for existing published Likes (rehearse on a backup first)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !app.IsBootstrapped() {
				if err := app.Bootstrap(); err != nil {
					return err
				}
			}
			return editorial.SeedLikes(app)
		},
	})
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{Priority: 999, Func: func(e *core.ServeEvent) error {
		if !e.Router.HasRoute(http.MethodGet, "/{path...}") {
			e.Router.GET("/{path...}", apis.Static(os.DirFS(publicDir), indexFallback))
		}
		return e.Next()
	}})
	// Deliberately no upstream self-update plugin: it would erase this extension.
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
