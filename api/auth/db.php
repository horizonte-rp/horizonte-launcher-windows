<?php
/**
 * Configuração do Banco de Dados - Auth API
 * Usa configuração centralizada de api/config/db.php
 */

// Incluir configuração centralizada
require_once __DIR__ . '/../config/db.php';

// Este arquivo agora apenas inclui a configuração principal
// Todas as constantes (DB_*, SECRET_KEY, ADMIN_API_KEY) e funções
// (getDB, jsonResponse, getRequestData, validateSignature, generateToken, logActivity)
// estão disponíveis através do require acima
