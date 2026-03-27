-- Optimización de performance para Malta BarberShop
-- Agregar índices para queries frecuentes

-- Índice para búsquedas por fecha (usado en GET /api/turnos)
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);

-- Índice para filtrado por estado
CREATE INDEX IF NOT EXISTS idx_turnos_estado ON turnos(estado);

-- Índice compuesto para queries de turnos por fecha y estado
CREATE INDEX IF NOT EXISTS idx_turnos_fecha_estado ON turnos(fecha, estado);

-- Índice para pagos por fecha (usado en métricas)
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_hora ON pagos(fecha_hora);

-- Índice para joins de pagos con turnos
CREATE INDEX IF NOT EXISTS idx_pagos_turno_id ON pagos(turno_id);

-- Índice para turnos_fijos activos
CREATE INDEX IF NOT EXISTS idx_turnos_fijos_activo ON turnos_fijos(activo);

-- Análisis de tablas para actualizar estadísticas del query planner
ANALYZE servicios;
ANALYZE turnos;
ANALYZE turnos_fijos;
ANALYZE pagos;
