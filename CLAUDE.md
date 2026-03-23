# Malta BarberShop - Sistema de Gestión de Turnos

## Descripción
Aplicación web para gestionar turnos de una barbería. Permite agendar citas, registrar pagos y ver métricas del negocio. Diseñada para uso interno del barbero.

## Stack Tecnológico
- **Backend**: Flask (Python)
- **Frontend**: HTML/CSS/JS vanilla (sin frameworks)
- **Base de datos**:
  - Desarrollo: SQLite (`barberia.db`)
  - Producción: PostgreSQL en Supabase
- **Hosting**: Render (con Gunicorn)

## Estructura del Proyecto
```
barberia-app/
├── app.py              # Backend Flask, API REST, conexión DB
├── templates/
│   └── index.html      # SPA con todas las secciones
├── static/
│   ├── css/styles.css  # Estilos BEM, tema barbería
│   └── js/app.js       # Lógica del calendario y UI
├── requirements.txt    # Dependencias Python
└── Procfile           # Configuración Gunicorn para Render
```

## Modelo de Datos

### Tablas
- **servicios**: Tipos de corte con precios (Corte, Corte+Barba, Color, Personalizado)
- **turnos**: Citas individuales con fecha, horario, cliente, duración, estado
- **turnos_fijos**: Clientes recurrentes (mismo día/hora cada semana)
- **pagos**: Registro de cobros vinculados a turnos

### Estados de turno
- `pendiente`: Turno agendado, sin completar
- `completado`: Turno realizado y cobrado
- `cancelado`: Turno cancelado (soft delete)

## Funcionalidades Principales

### Agenda (calendario estilo Apple Calendar)
- Vista día y semana con timeline vertical (9:00-22:00)
- Indicador de hora actual (línea roja)
- Drag & drop para mover turnos
- Swipe en móvil para navegar
- Eventos superpuestos se muestran lado a lado
- Click en slot vacío → crear turno
- Click en turno → popover con acciones (Cobrar/Cancelar)

### Turnos Fijos
- Clientes que vienen siempre el mismo día/hora
- Se generan automáticamente cada semana
- Badge "FIJO" en el calendario

### Pagos
- Medios: Efectivo, Transferencia, Mercado Pago
- Historial con filtros por fecha y medio

### Métricas
- Ingresos totales y por medio de pago
- Gráfico de ingresos por día
- Estadísticas de turnos por estado

## API Endpoints

```
GET  /api/servicios                    # Lista servicios
PUT  /api/servicios/:id                # Actualizar precio

GET  /api/turnos?fecha_inicio&fecha_fin  # Lista turnos
POST /api/turnos                        # Crear turno
PUT  /api/turnos/:id                    # Actualizar turno
POST /api/turnos/:id/completar          # Marcar pagado
POST /api/turnos/:id/cancelar           # Cancelar

GET  /api/turnos-fijos                  # Lista fijos
POST /api/turnos-fijos                  # Crear fijo
PUT  /api/turnos-fijos/:id              # Actualizar fijo
DELETE /api/turnos-fijos/:id            # Eliminar fijo

POST /api/generar-turnos-semana         # Genera turnos desde fijos

GET  /api/pagos                         # Historial pagos
GET  /api/metricas                      # Estadísticas
```

## Configuración

### Variables de entorno
- `DATABASE_URL`: Connection string PostgreSQL (solo producción)
  - Usar Transaction Pooler de Supabase (puerto 6543)
  - Si no está definida, usa SQLite local

### Ejecutar localmente
```bash
pip install -r requirements.txt
python app.py
# Abrir http://localhost:5000
```

## Notas Técnicas

### Conexión a Supabase
- Se fuerza IPv4 en producción (Render tiene problemas con IPv6)
- Usar puerto 6543 (Transaction Pooler) en lugar de 5432

### CSS
- Metodología BEM para el calendario (`.cal__*`)
- Variables CSS con tema de barbería (--leather, --sage, --pole-red)
- Responsive: desktop, tablet, móvil

### JavaScript
- Arquitectura modular con IIFEs
- Módulos: CalendarState, CalendarRenderer, DragDropManager, SwipeManager, ModalManager, PopoverManager
- API wrapper centralizado

## Decisiones de Diseño
- SPA sin framework para simplicidad
- Dual DB (SQLite/PostgreSQL) para desarrollo fácil
- Turnos de 30 o 60 minutos (configurable al crear)
- Horario de trabajo: 9:00 - 22:00
- Domingo oculto por defecto (toggle disponible)
