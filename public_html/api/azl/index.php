<?php
/* AZL API proxy. Pattern: /public_html/api/azl/index.php -> /api/azl/handler.php
 * (handler and models live OUTSIDE the web root). */
declare(strict_types=1);
$domainRoot = dirname($_SERVER['DOCUMENT_ROOT']);
require $domainRoot . '/api/azl/handler.php';
