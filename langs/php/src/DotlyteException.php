<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Base exception for all DOTLYTE errors.
 */
class DotlyteException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?string $key = null,
        int $code = 0,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $code, $previous);
    }
}
