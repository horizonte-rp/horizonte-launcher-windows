<?php
/**
 * Logout do painel admin
 */

session_start();
session_destroy();

header('Location: index.php');
exit;
