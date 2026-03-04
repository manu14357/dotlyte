<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Interpolation;
use Dotlyte\InterpolationException;
use PHPUnit\Framework\TestCase;

final class InterpolationTest extends TestCase
{
    public function testSimpleReference(): void
    {
        $data = ['host' => 'localhost', 'url' => '${host}:3000'];
        $result = Interpolation::interpolate($data);
        $this->assertSame('localhost:3000', $result['url']);
    }

    public function testDefaultValue(): void
    {
        $data = ['url' => '${host:-fallback.io}:3000'];
        $result = Interpolation::interpolate($data);
        $this->assertSame('fallback.io:3000', $result['url']);
    }

    public function testErrorSyntax(): void
    {
        $data = ['url' => '${host:?Host is required}'];
        $this->expectException(InterpolationException::class);
        $this->expectExceptionMessage('Host is required');
        Interpolation::interpolate($data);
    }

    public function testDollarEscape(): void
    {
        $data = ['literal' => '$${NOT_A_REF}'];
        $result = Interpolation::interpolate($data);
        $this->assertSame('${NOT_A_REF}', $result['literal']);
    }

    public function testCircularDetection(): void
    {
        $data = ['a' => '${b}', 'b' => '${a}'];
        $this->expectException(InterpolationException::class);
        $this->expectExceptionMessage('Circular');
        Interpolation::interpolate($data);
    }

    public function testChainedReferences(): void
    {
        $data = [
            'host' => 'localhost',
            'port' => '3000',
            'url' => '${host}:${port}',
        ];
        $result = Interpolation::interpolate($data);
        $this->assertSame('localhost:3000', $result['url']);
    }

    public function testDeepInterpolation(): void
    {
        $data = [
            'host' => 'db.local',
            'database' => [
                'url' => '${host}:5432',
            ],
        ];
        $result = Interpolation::interpolateDeep($data);
        $this->assertSame('db.local:5432', $result['database']['url']);
    }

    public function testNoInterpolationNeeded(): void
    {
        $data = ['host' => 'localhost', 'port' => '3000'];
        $result = Interpolation::interpolate($data);
        $this->assertSame('localhost', $result['host']);
        $this->assertSame('3000', $result['port']);
    }
}
