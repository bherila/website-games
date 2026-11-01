<?php

namespace App\Enums\Games;

enum GameSlug: string
{
    /**
     * Tower 2 keeps one tower per account for now. Later tower files will each
     * get their own save slot, so the slot names the file rather than "autosave".
     */
    public const TOWER_2_SLOT = 'main';

    case ChicksChallenge = 'chicks-challenge';
    case BlockBlaster = 'block-blaster';
    case PlateEscape = 'plate-escape';
    case MarbleSort = 'marble-sort';
    case ParkingPickup = 'parking-pickup';
    case Hover = 'hover';
    case MathHorde = 'math-horde';
    case TwentyFortyEight = '2048';
    case MarbleWorks = 'marble-works';
    case Tower2 = 'tower-2';

    public function supports(GameDataScope $scope, string $slot): bool
    {
        return match ($scope) {
            GameDataScope::Profile => $this->supportsProfileSlot($slot),
            GameDataScope::Level => $this->supportsLevelSlot($slot),
            GameDataScope::Save => $this === self::Tower2
                ? $slot === self::TOWER_2_SLOT
                : in_array($this, [self::MarbleSort, self::ParkingPickup, self::TwentyFortyEight], true) && $slot === 'autosave',
        };
    }

    private function supportsProfileSlot(string $slot): bool
    {
        if ($slot === 'default') {
            return true;
        }

        return $slot === 'inventory'
            && in_array($this, [self::MarbleSort, self::ParkingPickup], true);
    }

    private function supportsLevelSlot(string $slot): bool
    {
        // Tower 2 is a sandbox: no level campaign.
        if ($this === self::Tower2) {
            return false;
        }

        // 2048 is score-only: it has board sizes, not a level campaign.
        if ($this === self::TwentyFortyEight) {
            return false;
        }

        if ($this === self::Hover) {
            return in_array($slot, ['city', 'neon', 'garden', 'temple', 'glacier', 'sewer', 'castle'], true);
        }

        if (! ctype_digit($slot) || (string) ((int) $slot) !== $slot) {
            return false;
        }

        $level = (int) $slot;
        $maximum = match ($this) {
            self::ChicksChallenge => 45,
            self::PlateEscape => 30,
            self::MathHorde => 12,
            self::MarbleWorks => 24,
            default => 25,
        };

        return $level >= 1 && $level <= $maximum;
    }
}
