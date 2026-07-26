<?php

namespace App\Enums\Games;

enum GameDataScope: string
{
    case Profile = 'profile';
    case Level = 'level';
    case Save = 'save';
}
