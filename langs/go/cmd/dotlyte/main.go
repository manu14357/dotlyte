// Command dotlyte is the CLI tool for the dotlyte configuration library.
//
// Usage:
//
//	dotlyte <command> [options]
//
// Commands:
//
//	check           Validate .env files against schema
//	diff <f1> <f2>  Compare two env files
//	generate-types  Generate Go struct from config
//	encrypt <file>  Encrypt sensitive values in .env
//	doctor          Check for common env issues
//	init            Create starter files
//	version         Show version
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	dotlyte "github.com/dotlyte-io/dotlyte/langs/go"
)

const version = "0.1.2"

const helpText = `dotlyte v%s — The universal configuration CLI

Usage: dotlyte <command> [options]

Commands:
  check             Validate .env files against schema
  diff <f1> <f2>    Compare two env files
  generate-types    Generate Go struct from config
  encrypt <file>    Encrypt sensitive values in .env
  doctor            Check for common env issues
  init              Create starter files
  version           Show version

Options:
  --help, -h        Show help
  --version, -v     Show version
`

func main() {
	args := os.Args[1:]

	if len(args) == 0 || hasFlag(args, "--help") || hasFlag(args, "-h") {
		fmt.Printf(helpText, version)
		os.Exit(0)
	}

	if hasFlag(args, "--version") || hasFlag(args, "-v") || args[0] == "version" {
		fmt.Println(version)
		os.Exit(0)
	}

	command := args[0]
	rest := args[1:]

	var err error
	switch command {
	case "check":
		err = cmdCheck(rest)
	case "diff":
		err = cmdDiff(rest)
	case "generate-types":
		err = cmdGenerateTypes(rest)
	case "encrypt":
		err = cmdEncrypt(rest)
	case "doctor":
		err = cmdDoctor(rest)
	case "init":
		err = cmdInit(rest)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		fmt.Printf(helpText, version)
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "\nError: %v\n", err)
		os.Exit(1)
	}
}

// cmdCheck validates .env files against a JSON schema.
func cmdCheck(args []string) error {
	schemaPath := getArg(args, "--schema")
	envFile := getArg(args, "--env")
	strict := hasFlag(args, "--strict")

	fmt.Println("dotlyte check")
	fmt.Println()

	if schemaPath == "" {
		schemaPath = findSchemaFile()
	}

	if schemaPath == "" {
		fmt.Println("  No schema file found. Performing basic validation...")
		return basicCheck(envFile)
	}

	fmt.Printf("  Schema: %s\n", schemaPath)

	// Load schema
	content, err := os.ReadFile(schemaPath)
	if err != nil {
		return fmt.Errorf("failed to read schema file: %s: %w", schemaPath, err)
	}

	var schemaRaw map[string]map[string]interface{}
	if err := json.Unmarshal(content, &schemaRaw); err != nil {
		return fmt.Errorf("failed to parse schema file: %s: %w", schemaPath, err)
	}

	schema := make(dotlyte.DotlyteSchema)
	for key, def := range schemaRaw {
		rule := &dotlyte.SchemaRule{}
		if t, ok := def["type"].(string); ok {
			rule.Type = t
		}
		if r, ok := def["required"].(bool); ok {
			rule.Required = r
		}
		schema[key] = rule
	}

	// Load config
	opts := &dotlyte.LoadOptions{}
	if envFile != "" {
		opts.Files = []string{envFile}
	}

	config, err := dotlyte.Load(opts)
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	violations := dotlyte.ValidateSchema(config.ToMap(), schema, strict)
	if len(violations) == 0 {
		fmt.Println("\n  All checks passed!")
		return nil
	}

	fmt.Printf("\n  %d issue(s) found:\n\n", len(violations))
	for _, v := range violations {
		fmt.Printf("    x %s: %s\n", v.Key, v.Message)
	}
	fmt.Println()
	os.Exit(1)
	return nil
}

// cmdDiff compares two .env files.
func cmdDiff(args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: dotlyte diff <file1> <file2>")
	}

	file1, file2 := args[0], args[1]

	env1, err := parseEnvFileSimple(file1)
	if err != nil {
		return err
	}
	env2, err := parseEnvFileSimple(file2)
	if err != nil {
		return err
	}

	allKeys := make(map[string]bool)
	for k := range env1 {
		allKeys[k] = true
	}
	for k := range env2 {
		allKeys[k] = true
	}

	var added, removed, unchanged []string
	type change struct {
		key, from, to string
	}
	var changed []change

	for k := range allKeys {
		_, in1 := env1[k]
		_, in2 := env2[k]
		if !in1 && in2 {
			added = append(added, k)
		} else if in1 && !in2 {
			removed = append(removed, k)
		} else if env1[k] != env2[k] {
			changed = append(changed, change{k, maskIfSensitive(k, env1[k]), maskIfSensitive(k, env2[k])})
		} else {
			unchanged = append(unchanged, k)
		}
	}

	sort.Strings(added)
	sort.Strings(removed)
	sort.Strings(unchanged)

	fmt.Println()
	fmt.Println("dotlyte diff")
	fmt.Printf("  %s <-> %s\n\n", file1, file2)

	if len(added) > 0 {
		fmt.Printf("  Added (%d):\n", len(added))
		for _, k := range added {
			fmt.Printf("     + %s=%s\n", k, maskIfSensitive(k, env2[k]))
		}
	}
	if len(removed) > 0 {
		fmt.Printf("  Removed (%d):\n", len(removed))
		for _, k := range removed {
			fmt.Printf("     - %s=%s\n", k, maskIfSensitive(k, env1[k]))
		}
	}
	if len(changed) > 0 {
		fmt.Printf("  Changed (%d):\n", len(changed))
		for _, c := range changed {
			fmt.Printf("     ~ %s: %s -> %s\n", c.key, c.from, c.to)
		}
	}

	fmt.Printf("\n  Summary: %d added, %d removed, %d changed, %d unchanged\n\n",
		len(added), len(removed), len(changed), len(unchanged))
	return nil
}

// cmdGenerateTypes generates a Go struct definition from loaded config.
func cmdGenerateTypes(args []string) error {
	envFile := getArg(args, "--input")
	output := getArg(args, "--output")
	pkgName := getArg(args, "--package")
	if pkgName == "" {
		pkgName = "config"
	}

	opts := &dotlyte.LoadOptions{}
	if envFile != "" {
		opts.Files = []string{envFile}
	}

	config, err := dotlyte.Load(opts)
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	flat := config.ToFlatMap()

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("package %s\n\n", pkgName))
	sb.WriteString("// Config holds the application configuration.\n")
	sb.WriteString("// Auto-generated by dotlyte generate-types.\n")
	sb.WriteString("type Config struct {\n")

	keys := make([]string, 0, len(flat))
	for k := range flat {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, key := range keys {
		fieldName := toGoFieldName(key)
		goType := inferGoType(flat[key])
		envTag := strings.ToUpper(strings.ReplaceAll(key, ".", "_"))
		sb.WriteString(fmt.Sprintf("\t%s %s `env:\"%s\"`\n", fieldName, goType, envTag))
	}
	sb.WriteString("}\n")

	result := sb.String()

	if output != "" {
		if err := os.WriteFile(output, []byte(result), 0644); err != nil {
			return fmt.Errorf("failed to write output: %w", err)
		}
		fmt.Printf("Generated %s\n", output)
	} else {
		fmt.Println(result)
	}
	return nil
}

// cmdEncrypt encrypts or decrypts env file values.
func cmdEncrypt(args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: dotlyte encrypt <file> [--decrypt] [--keys KEY1,KEY2]")
	}

	file := args[0]
	decrypt := hasFlag(args, "--decrypt")
	keysArg := getArg(args, "--keys")

	encKey := dotlyte.ResolveEncryptionKey("")
	if encKey == "" {
		return fmt.Errorf("no encryption key found. Set DOTLYTE_KEY environment variable or create a .dotlyte-keys file")
	}

	content, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("cannot read file: %s: %w", file, err)
	}

	var targetKeys map[string]bool
	if keysArg != "" {
		targetKeys = make(map[string]bool)
		for _, k := range strings.Split(keysArg, ",") {
			targetKeys[strings.TrimSpace(k)] = true
		}
	}

	lines := strings.Split(string(content), "\n")
	var result []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			result = append(result, line)
			continue
		}
		eqIdx := strings.Index(trimmed, "=")
		if eqIdx < 0 {
			result = append(result, line)
			continue
		}

		key := strings.TrimSpace(trimmed[:eqIdx])
		value := strings.TrimSpace(trimmed[eqIdx+1:])

		if targetKeys != nil && !targetKeys[key] {
			result = append(result, line)
			continue
		}

		if decrypt {
			if dotlyte.IsEncrypted(value) {
				decrypted, err := dotlyte.DecryptValue(value, encKey)
				if err != nil {
					return fmt.Errorf("failed to decrypt '%s': %w", key, err)
				}
				result = append(result, fmt.Sprintf("%s=%s", key, decrypted))
			} else {
				result = append(result, line)
			}
		} else {
			if !dotlyte.IsEncrypted(value) {
				// Strip quotes
				if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[0] == value[len(value)-1] {
					value = value[1 : len(value)-1]
				}
				encrypted, err := dotlyte.EncryptValue(value, encKey)
				if err != nil {
					return fmt.Errorf("failed to encrypt '%s': %w", key, err)
				}
				result = append(result, fmt.Sprintf("%s=%s", key, encrypted))
			} else {
				result = append(result, line)
			}
		}
	}

	if err := os.WriteFile(file, []byte(strings.Join(result, "\n")), 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	action := "Encrypted"
	if decrypt {
		action = "Decrypted"
	}
	fmt.Printf("%s %s\n", action, file)
	return nil
}

// cmdDoctor diagnoses common configuration issues.
func cmdDoctor(args []string) error {
	_ = args
	fmt.Println()
	fmt.Println("dotlyte doctor")
	fmt.Println()

	issues := 0
	warnings := 0

	// Check 1: .env exists but .env.example doesn't
	if fileExistsCompat(".env") && !fileExistsCompat(".env.example") {
		fmt.Println("  WARNING: .env exists but .env.example is missing")
		fmt.Println("     Create .env.example to help team members set up their environment")
		fmt.Println()
		warnings++
	}

	// Check 2: .env in .gitignore
	if fileExistsCompat(".gitignore") {
		gitignore, err := os.ReadFile(".gitignore")
		if err == nil {
			hasEnvIgnore := false
			for _, line := range strings.Split(string(gitignore), "\n") {
				trimmed := strings.TrimSpace(line)
				if trimmed == ".env" || trimmed == ".env*" || trimmed == ".env.*" {
					hasEnvIgnore = true
					break
				}
			}
			if !hasEnvIgnore && fileExistsCompat(".env") {
				fmt.Println("  ERROR: .env is NOT in .gitignore — secrets may be committed!")
				fmt.Println("     Add '.env' to your .gitignore file")
				fmt.Println()
				issues++
			} else if hasEnvIgnore {
				fmt.Println("  OK: .env is properly gitignored")
			}
		}
	}

	// Check 3: Keys in .env.example missing from .env
	if fileExistsCompat(".env.example") && fileExistsCompat(".env") {
		exampleKeys := getEnvFileKeys(".env.example")
		envKeys := getEnvFileKeys(".env")

		envKeySet := make(map[string]bool)
		for _, k := range envKeys {
			envKeySet[k] = true
		}

		var missing []string
		for _, k := range exampleKeys {
			if !envKeySet[k] {
				missing = append(missing, k)
			}
		}
		if len(missing) > 0 {
			fmt.Printf("  WARNING: Keys in .env.example missing from .env: %s\n", strings.Join(missing, ", "))
			warnings++
		} else {
			fmt.Println("  OK: All .env.example keys are present in .env")
		}
	}

	// Check 4: Duplicate keys
	for _, file := range []string{".env", ".env.local", ".env.example"} {
		if !fileExistsCompat(file) {
			continue
		}
		dupes := findDuplicateKeys(file)
		if len(dupes) > 0 {
			fmt.Printf("  WARNING: Duplicate keys in %s: %s\n", file, strings.Join(dupes, ", "))
			warnings++
		}
	}

	// Check 5: Placeholder values
	if fileExistsCompat(".env") {
		placeholders := findPlaceholderValues(".env")
		if len(placeholders) > 0 {
			fmt.Printf("  WARNING: Possible placeholder values in .env: %s\n", strings.Join(placeholders, ", "))
			warnings++
		}
	}

	fmt.Println()
	if issues == 0 && warnings == 0 {
		fmt.Println("  All checks passed!")
	} else {
		fmt.Printf("  %d issue(s), %d warning(s)\n", issues, warnings)
	}
	fmt.Println()
	return nil
}

// cmdInit creates starter configuration files.
func cmdInit(args []string) error {
	_ = args
	fmt.Println()
	fmt.Println("dotlyte init")
	fmt.Println()

	// Create .env.example
	if !fileExistsCompat(".env.example") {
		content := `# Application Configuration
# Copy this file to .env and fill in the values

# Server
PORT=3000
HOST=localhost

# Database
# DATABASE_URL=postgres://user:password@localhost:5432/mydb

# API Keys
# API_KEY=your-api-key-here
`
		if err := os.WriteFile(".env.example", []byte(content), 0644); err != nil {
			return fmt.Errorf("failed to create .env.example: %w", err)
		}
		fmt.Println("  Created .env.example")
	} else {
		fmt.Println("  .env.example already exists, skipping")
	}

	// Create .env from .env.example if missing
	if !fileExistsCompat(".env") && fileExistsCompat(".env.example") {
		content, err := os.ReadFile(".env.example")
		if err == nil {
			if err := os.WriteFile(".env", content, 0644); err != nil {
				return fmt.Errorf("failed to create .env: %w", err)
			}
			fmt.Println("  Created .env (from .env.example)")
		}
	}

	// Update .gitignore
	if fileExistsCompat(".gitignore") {
		gitignore, err := os.ReadFile(".gitignore")
		if err == nil {
			if !strings.Contains(string(gitignore), ".env") {
				f, err := os.OpenFile(".gitignore", os.O_APPEND|os.O_WRONLY, 0644)
				if err == nil {
					defer f.Close()
					f.WriteString("\n# dotlyte\n.env\n.env.local\n.env.*.local\n.dotlyte-keys\n")
					fmt.Println("  Updated .gitignore with env patterns")
				}
			} else {
				fmt.Println("  .gitignore already has env patterns")
			}
		}
	} else {
		content := "# dotlyte\n.env\n.env.local\n.env.*.local\n.dotlyte-keys\n"
		if err := os.WriteFile(".gitignore", []byte(content), 0644); err != nil {
			return fmt.Errorf("failed to create .gitignore: %w", err)
		}
		fmt.Println("  Created .gitignore")
	}

	fmt.Println()
	fmt.Println("  Done! Edit .env to configure your application.")
	fmt.Println()
	return nil
}

// --- Helper functions ---

func hasFlag(args []string, flag string) bool {
	for _, a := range args {
		if a == flag {
			return true
		}
	}
	return false
}

func getArg(args []string, flag string) string {
	for i, a := range args {
		if a == flag && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

func fileExistsCompat(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// basicCheck performs a basic .env file validation without a schema.
func basicCheck(envFile string) error {
	if envFile == "" {
		envFile = ".env"
	}
	if !fileExistsCompat(envFile) {
		fmt.Printf("  ⚠ No env file found at '%s'\n", envFile)
		return nil
	}
	envMap, err := parseEnvFileSimple(envFile)
	if err != nil {
		return fmt.Errorf("failed to parse %s: %w", envFile, err)
	}
	fmt.Printf("  ✓ %s parsed (%d variables)\n", envFile, len(envMap))

	dupes := findDuplicateKeys(envFile)
	if len(dupes) > 0 {
		for _, d := range dupes {
			fmt.Printf("  ⚠ Duplicate key: %s\n", d)
		}
	}

	placeholders := findPlaceholderValues(envFile)
	if len(placeholders) > 0 {
		for _, p := range placeholders {
			fmt.Printf("  ⚠ Placeholder value: %s\n", p)
		}
	}

	fmt.Println("\n  ✓ Basic check passed")
	return nil
}

func findSchemaFile() string {
	candidates := []string{
		"dotlyte.schema.json",
		"env.schema.json",
		".env.schema.json",
		"config.schema.json",
	}
	for _, c := range candidates {
		if fileExistsCompat(c) {
			return c
		}
	}
	return ""
}

func parseEnvFileSimple(path string) (map[string]string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read file: %s: %w", path, err)
	}
	result := make(map[string]string)
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if strings.HasPrefix(trimmed, "export ") {
			trimmed = strings.TrimSpace(trimmed[7:])
		}
		eqIdx := strings.Index(trimmed, "=")
		if eqIdx <= 0 {
			continue
		}
		key := strings.TrimSpace(trimmed[:eqIdx])
		value := strings.TrimSpace(trimmed[eqIdx+1:])
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[0] == value[len(value)-1] {
			value = value[1 : len(value)-1]
		}
		result[key] = value
	}
	return result, nil
}

func maskIfSensitive(key, value string) string {
	sensitive := []string{"password", "secret", "token", "key", "auth", "credential"}
	lower := strings.ToLower(key)
	for _, s := range sensitive {
		if strings.Contains(lower, s) {
			return dotlyte.FormatRedacted(value)
		}
	}
	return value
}

func getEnvFileKeys(path string) []string {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var keys []string
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		eqIdx := strings.Index(trimmed, "=")
		if eqIdx > 0 {
			keys = append(keys, strings.TrimSpace(trimmed[:eqIdx]))
		}
	}
	return keys
}

func findDuplicateKeys(path string) []string {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	counts := make(map[string]int)
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		eqIdx := strings.Index(trimmed, "=")
		if eqIdx > 0 {
			key := strings.TrimSpace(trimmed[:eqIdx])
			counts[key]++
		}
	}
	var dupes []string
	for k, c := range counts {
		if c > 1 {
			dupes = append(dupes, k)
		}
	}
	sort.Strings(dupes)
	return dupes
}

var placeholderPatterns = []string{
	"your-", "changeme", "todo", "fixme", "replace", "xxx", "placeholder",
}

func findPlaceholderValues(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var placeholders []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eqIdx := strings.Index(line, "=")
		if eqIdx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eqIdx])
		value := strings.ToLower(strings.TrimSpace(line[eqIdx+1:]))
		for _, p := range placeholderPatterns {
			if strings.Contains(value, p) {
				placeholders = append(placeholders, key)
				break
			}
		}
	}
	return placeholders
}

func toGoFieldName(key string) string {
	parts := strings.FieldsFunc(key, func(r rune) bool {
		return r == '.' || r == '_' || r == '-'
	})
	var sb strings.Builder
	for _, p := range parts {
		if p == "" {
			continue
		}
		sb.WriteString(strings.ToUpper(p[:1]))
		if len(p) > 1 {
			sb.WriteString(strings.ToLower(p[1:]))
		}
	}
	return sb.String()
}

func inferGoType(value string) string {
	lower := strings.ToLower(value)
	switch lower {
	case "true", "false", "yes", "no", "on", "off":
		return "bool"
	}
	// Try integer
	isInt := true
	for _, c := range value {
		if c < '0' || c > '9' {
			if c != '-' || len(value) == 1 {
				isInt = false
				break
			}
		}
	}
	if isInt && value != "" {
		return "int"
	}
	// Try float
	dotCount := 0
	isFloat := true
	for _, c := range value {
		if c == '.' {
			dotCount++
		} else if c < '0' || c > '9' {
			isFloat = false
			break
		}
	}
	if isFloat && dotCount == 1 {
		return "float64"
	}
	return "string"
}

// Suppress unused import warning
var _ = filepath.Join
