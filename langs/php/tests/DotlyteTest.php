<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Config;
use Dotlyte\Dotlyte;
use Dotlyte\DotlyteException;
use Dotlyte\LoadOptions;
use PHPUnit\Framework\TestCase;

final class DotlyteTest extends TestCase
{
    public function testLoadReturnsConfig(): void
    {
        $config = Dotlyte::load(new LoadOptions(defaults: ['port' => 3000]));
        $this->assertInstanceOf(Config::class, $config);
    }

    public function testDefaults(): void
    {
        $config = Dotlyte::load(new LoadOptions(
            defaults: ['port' => 3000, 'debug' => false],
        ));
        $this->assertSame(3000, $config->get('port'));
        $this->assertFalse($config->get('debug'));
    }

    public function testDotNotationAccess(): void
    {
        $config = new Config([
            'port' => 8080,
            'database' => ['host' => 'localhost', 'port' => 5432],
        ]);
        $this->assertSame(8080, $config->port);
        $this->assertSame('localhost', $config->database->host);
    }

    public function testGetWithDefault(): void
    {
        $config = new Config([]);
        $this->assertSame('fallback', $config->get('missing', 'fallback'));
    }

    public function testRequireThrowsOnMissing(): void
    {
        $config = new Config([]);
        $this->expectException(DotlyteException::class);
        $config->require('MISSING');
    }

    public function testNestedGet(): void
    {
        $config = new Config([
            'database' => ['host' => 'localhost'],
        ]);
        $this->assertSame('localhost', $config->get('database.host'));
    }

    public function testHas(): void
    {
        $config = new Config(['port' => 8080]);
        $this->assertTrue($config->has('port'));
        $this->assertFalse($config->has('missing'));
    }

    public function testToArray(): void
    {
        $data = ['port' => 8080];
        $config = new Config($data);
        $this->assertSame($data, $config->toArray());
    }
}
