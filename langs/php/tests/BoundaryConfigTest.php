<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\BoundaryConfig;
use Dotlyte\DotlyteException;
use PHPUnit\Framework\TestCase;

final class BoundaryConfigTest extends TestCase
{
    private function sampleData(): array
    {
        return [
            'DB_PASSWORD' => 's3cret',
            'DB_HOST' => 'localhost',
            'API_URL' => 'https://api.example.com',
            'APP_NAME' => 'DOTLYTE',
            'SHARED_KEY' => 'shared-value',
        ];
    }

    public function testIsServerContext(): void
    {
        $bc = new BoundaryConfig([], [], [], []);
        $this->assertTrue($bc->isServerContext());
    }

    public function testServerOnlyFiltering(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD', 'DB_HOST'],
            clientKeys: ['API_URL', 'APP_NAME'],
            sharedKeys: ['SHARED_KEY'],
        );

        $server = $bc->serverOnly();
        $this->assertSame('s3cret', $server['DB_PASSWORD']);
        $this->assertSame('localhost', $server['DB_HOST']);
        $this->assertArrayNotHasKey('API_URL', $server);
        $this->assertArrayNotHasKey('APP_NAME', $server);
    }

    public function testClientOnlyFiltering(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD'],
            clientKeys: ['API_URL', 'APP_NAME'],
            sharedKeys: [],
        );

        $client = $bc->clientOnly();
        $this->assertSame('https://api.example.com', $client['API_URL']);
        $this->assertSame('DOTLYTE', $client['APP_NAME']);
        $this->assertArrayNotHasKey('DB_PASSWORD', $client);
    }

    public function testGetReturnsServerKey(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD'],
            clientKeys: ['API_URL'],
            sharedKeys: [],
        );

        $this->assertSame('s3cret', $bc->get('DB_PASSWORD'));
    }

    public function testGetReturnsClientKey(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD'],
            clientKeys: ['API_URL'],
            sharedKeys: [],
        );

        $this->assertSame('https://api.example.com', $bc->get('API_URL'));
    }

    public function testGetReturnsSharedKey(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD'],
            clientKeys: ['API_URL'],
            sharedKeys: ['SHARED_KEY'],
        );

        $this->assertSame('shared-value', $bc->get('SHARED_KEY'));
    }

    public function testBoundaryViolationThrows(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD'],
            clientKeys: ['API_URL'],
            sharedKeys: [],
        );

        $this->expectException(DotlyteException::class);
        $this->expectExceptionMessageMatches('/not declared in any boundary/');

        $bc->get('APP_NAME'); // not in any boundary list
    }

    public function testEmptyBoundaryListsAllowAllKeys(): void
    {
        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: [],
            clientKeys: [],
            sharedKeys: [],
        );

        // When all lists are empty, no boundary check is enforced
        $this->assertSame('localhost', $bc->get('DB_HOST'));
    }

    public function testOnSecretAccessCallback(): void
    {
        $accessed = [];

        $bc = new BoundaryConfig(
            $this->sampleData(),
            serverKeys: ['DB_PASSWORD'],
            clientKeys: ['API_URL'],
            sharedKeys: [],
            onSecretAccess: function (string $key, mixed $value) use (&$accessed) {
                $accessed[] = $key;
            },
        );

        $bc->get('DB_PASSWORD');
        $this->assertContains('DB_PASSWORD', $accessed);

        // Client key should NOT trigger callback
        $bc->get('API_URL');
        $this->assertNotContains('API_URL', $accessed);
    }

    public function testDotNotationAccess(): void
    {
        $bc = new BoundaryConfig(
            ['db' => ['host' => 'localhost', 'password' => 's3cret']],
            serverKeys: ['db.password'],
            clientKeys: ['db.host'],
            sharedKeys: [],
        );

        $this->assertSame('localhost', $bc->get('db.host'));
        $this->assertSame('s3cret', $bc->get('db.password'));
    }
}
