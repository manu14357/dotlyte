<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Coercion;
use PHPUnit\Framework\TestCase;

final class CoercionTest extends TestCase
{
    public function testNullValues(): void
    {
        $this->assertNull(Coercion::coerce('null'));
        $this->assertNull(Coercion::coerce('none'));
        $this->assertNull(Coercion::coerce('nil'));
        $this->assertNull(Coercion::coerce(''));
    }

    public function testBooleanTrue(): void
    {
        foreach (['true', 'TRUE', 'yes', '1', 'on'] as $val) {
            $this->assertTrue(Coercion::coerce($val), "Expected true for {$val}");
        }
    }

    public function testBooleanFalse(): void
    {
        foreach (['false', 'no', '0', 'off'] as $val) {
            $this->assertFalse(Coercion::coerce($val), "Expected false for {$val}");
        }
    }

    public function testIntegers(): void
    {
        $this->assertSame(8080, Coercion::coerce('8080'));
        $this->assertSame(-42, Coercion::coerce('-42'));
    }

    public function testFloats(): void
    {
        $this->assertSame(3.14, Coercion::coerce('3.14'));
    }

    public function testLists(): void
    {
        $this->assertSame(['a', 'b', 'c'], Coercion::coerce('a,b,c'));
    }

    public function testPassThrough(): void
    {
        $this->assertSame(42, Coercion::coerce(42));
        $this->assertTrue(Coercion::coerce(true));
    }

    public function testPlainStrings(): void
    {
        $this->assertSame('hello', Coercion::coerce('hello'));
    }
}
