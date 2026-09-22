<?php
declare(strict_types=1);

// Copy file này thành config.php trên PHP hosting.
// Không commit config.php có secret thật vào Git.
// openssl rand -hex 32
$fcfundZaloProxySecret = 'replace-with-a-random-secret-at-least-32-characters';
