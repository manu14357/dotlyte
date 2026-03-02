package dotlyte

// DeepMerge merges two maps. Values in override take precedence.
// Nested maps are merged recursively.
func DeepMerge(base, override map[string]any) map[string]any {
	result := make(map[string]any, len(base))
	for k, v := range base {
		result[k] = v
	}

	for k, v := range override {
		if baseVal, exists := result[k]; exists {
			baseMap, baseIsMap := baseVal.(map[string]any)
			overMap, overIsMap := v.(map[string]any)
			if baseIsMap && overIsMap {
				result[k] = DeepMerge(baseMap, overMap)
				continue
			}
		}
		result[k] = v
	}

	return result
}
