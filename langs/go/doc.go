// Package dotlyte is the universal configuration library.
//
// One function call to load .env, YAML, JSON, TOML, environment variables,
// and defaults with automatic type coercion and layered priority.
//
// Usage:
//
//	config, err := dotlyte.Load(nil)
//	port := config.Get("port", 3000)
//	host := config.Require("database.host")
package dotlyte
