<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Main entry point for DOTLYTE configuration loading.
 */
final class Dotlyte
{
    /**
     * Load configuration from all available sources.
     *
     * @param LoadOptions|null $options
     * @return Config
     */
    public static function load(?LoadOptions $options = null): Config
    {
        $options ??= new LoadOptions();
        $loader = new Loader($options);
        return $loader->load();
    }
}
