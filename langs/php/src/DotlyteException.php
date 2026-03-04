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

/**
 * Raised when a required config key is missing.
 */
class MissingKeyException extends DotlyteException
{
    /** @var list<string> */
    public readonly array $sourcesChecked;

    /**
     * @param list<string> $sourcesChecked
     */
    public function __construct(
        string $message,
        ?string $key = null,
        array $sourcesChecked = [],
        int $code = 0,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $key, $code, $previous);
        $this->sourcesChecked = $sourcesChecked;
    }
}

/**
 * Raised when a config file cannot be read or found.
 */
class FileException extends DotlyteException
{
    public function __construct(
        string $message,
        public readonly ?string $filePath = null,
        ?string $key = null,
        int $code = 0,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $key, $code, $previous);
    }
}

/**
 * Raised when schema validation fails.
 */
class ValidationException extends DotlyteException
{
    /** @var list<SchemaViolation> */
    public readonly array $violations;

    /**
     * @param list<SchemaViolation> $violations
     */
    public function __construct(
        string $message,
        array $violations = [],
        ?string $key = null,
        int $code = 0,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $key, $code, $previous);
        $this->violations = $violations;
    }
}

/**
 * Raised when variable interpolation fails (e.g., circular reference).
 */
class InterpolationException extends DotlyteException {}

/**
 * Raised when decryption of an encrypted value fails.
 */
class DecryptionException extends DotlyteException {}
