// Estado global
let currentDate = new Date();
let viewMode = 'diaria'; // 'diaria' o 'semanal'
let servicios = []; // Cache de servicios
let mostrarDomingo = false; // Por defecto no muestra domingo

// Horarios disponibles (9:00 a 22:00)
const HORARIOS_DISPONIBLES = [];
for (let h = 9; h <= 22; h++) {
    HORARIOS_DISPONIBLES.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 22) {
        HORARIOS_DISPONIBLES.push(`${h.toString().padStart(2, '0')}:30`);
    }
}

// Helpers de fecha
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_SEMANA_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function formatDateDisplay(date) {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    return date.toLocaleDateString('es-AR', options);
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getWeekEnd(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return end;
}

function isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

// API calls
async function api(endpoint, options = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error('API Error:', endpoint, error);
        throw error;
    }
}

// Cargar servicios
async function loadServicios() {
    servicios = await api('/servicios');
    return servicios;
}

// Poblar select de servicios
function populateServiciosSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = servicios.map(s =>
        `<option value="${s.id}">${s.nombre}${s.precio > 0 ? ` - $${s.precio}` : ''}</option>`
    ).join('');
}

// Poblar select de horarios
function populateHorariosSelect(selectId, valorActual = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = HORARIOS_DISPONIBLES.map(h =>
        `<option value="${h}" ${valorActual === h ? 'selected' : ''}>${h}</option>`
    ).join('');
}

// Navegación entre secciones
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.section).classList.add('active');

        // Cargar datos de la sección
        if (btn.dataset.section === 'agenda') loadAgenda();
        if (btn.dataset.section === 'turnos-fijos') loadTurnosFijos();
        if (btn.dataset.section === 'precios') loadPrecios();
        if (btn.dataset.section === 'pagos') loadPagos();
    });
});

// Toggle vista diaria/semanal
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        viewMode = btn.dataset.view;
        loadAgenda();
    });
});

// Navegación de fechas
document.getElementById('prev-date').addEventListener('click', () => {
    if (viewMode === 'diaria') {
        currentDate.setDate(currentDate.getDate() - 1);
    } else {
        currentDate.setDate(currentDate.getDate() - 7);
    }
    loadAgenda();
});

document.getElementById('next-date').addEventListener('click', () => {
    if (viewMode === 'diaria') {
        currentDate.setDate(currentDate.getDate() + 1);
    } else {
        currentDate.setDate(currentDate.getDate() + 7);
    }
    loadAgenda();
});

document.getElementById('today-btn').addEventListener('click', () => {
    currentDate = new Date();
    loadAgenda();
});

// Toggle mostrar domingo
document.getElementById('mostrar-domingo').addEventListener('change', (e) => {
    mostrarDomingo = e.target.checked;
    loadAgenda();
});

// Cargar agenda
async function loadAgenda() {
    const container = document.getElementById('agenda-container');
    const dateDisplay = document.getElementById('current-date-display');

    let fechaInicio, fechaFin;

    if (viewMode === 'diaria') {
        fechaInicio = fechaFin = formatDate(currentDate);
        dateDisplay.textContent = formatDateDisplay(currentDate);
    } else {
        const weekStart = getWeekStart(currentDate);
        const weekEnd = getWeekEnd(currentDate);
        fechaInicio = formatDate(weekStart);
        fechaFin = formatDate(weekEnd);
        dateDisplay.textContent = `${weekStart.getDate()}/${weekStart.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`;
    }

    // Generar turnos de la semana desde fijos
    await api('/generar-turnos-semana', {
        method: 'POST',
        body: { fecha_inicio: fechaInicio }
    });

    const turnos = await api(`/turnos?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);

    if (viewMode === 'diaria') {
        if (turnos.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay turnos programados</div>';
            return;
        }
        container.innerHTML = turnos.map(t => renderTurnoCard(t)).join('');
    } else {
        // Vista semanal en columnas
        container.innerHTML = renderWeekGrid(turnos);
    }
}

// Horarios de trabajo (9:00 a 22:00)
const HORAS_TRABAJO = [];
for (let h = 9; h <= 22; h++) {
    HORAS_TRABAJO.push(`${h.toString().padStart(2, '0')}:00`);
}

function renderWeekGrid(turnos) {
    const weekStart = getWeekStart(currentDate);
    const diasAMostrar = mostrarDomingo ? 7 : 6; // 6 días (Lun-Sab) o 7 (Lun-Dom)

    // Agrupar turnos por fecha y hora
    const turnosPorFechaHora = {};
    turnos.forEach(t => {
        // Extraer solo la hora (HH:00)
        const horaBase = t.horario.substring(0, 2) + ':00';
        const key = `${t.fecha}_${horaBase}`;
        if (!turnosPorFechaHora[key]) turnosPorFechaHora[key] = [];
        turnosPorFechaHora[key].push(t);
    });

    // Ajustar columnas según si se muestra domingo
    const gridCols = `60px repeat(${diasAMostrar}, 1fr)`;
    let html = `<div class="calendar-grid" style="grid-template-columns: ${gridCols}">`;

    // Header
    html += '<div class="calendar-header">';
    html += '<div class="calendar-header-cell"></div>'; // Celda vacía esquina

    for (let i = 0; i < diasAMostrar; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const isTodayClass = isToday(d) ? 'today' : '';

        html += `
            <div class="calendar-header-cell ${isTodayClass}">
                <span class="day-name">${DIAS_SEMANA[i]}</span>
                <span class="day-number">${d.getDate()}</span>
            </div>
        `;
    }
    html += '</div>';

    // Body - filas por hora
    html += '<div class="calendar-body">';

    HORAS_TRABAJO.forEach(hora => {
        html += '<div class="calendar-row">';
        html += `<div class="calendar-time">${hora}</div>`;

        for (let i = 0; i < diasAMostrar; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const fechaStr = formatDate(d);
            const key = `${fechaStr}_${hora}`;
            const turnosEnCelda = turnosPorFechaHora[key] || [];
            const isTodayClass = isToday(d) ? 'today' : '';

            html += `<div class="calendar-cell ${isTodayClass}">`;
            turnosEnCelda.forEach(t => {
                html += renderGridTurno(t);
            });
            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div></div>';
    return html;
}

function renderGridTurno(turno) {
    const estadoClass = turno.estado === 'completado' ? 'completado' : turno.estado === 'cancelado' ? 'cancelado' : '';

    let actions = '';
    if (turno.estado === 'pendiente') {
        actions = `
            <div class="grid-turno-actions">
                <button onclick="event.stopPropagation(); completarTurno(${turno.id}, '${(turno.servicio_nombre || '').replace(/'/g, "\\'")}', ${turno.servicio_precio || 0})">$</button>
                <button onclick="event.stopPropagation(); cancelarTurno(${turno.id})">X</button>
            </div>
        `;
    }

    return `
        <div class="grid-turno ${estadoClass}" title="${turno.horario} - ${turno.nombre_cliente}${turno.servicio_nombre ? ' - ' + turno.servicio_nombre : ''}">
            <div class="grid-turno-client">${turno.nombre_cliente}</div>
            ${turno.servicio_nombre ? `<div class="grid-turno-service">${turno.servicio_nombre}</div>` : ''}
            ${turno.estado === 'completado' ? `<div class="grid-turno-service">$${turno.monto}</div>` : ''}
            ${actions}
        </div>
    `;
}

function renderTurnoCard(turno) {
    let badges = '';
    if (turno.turno_fijo_id) badges += '<span class="turno-badge badge-fijo">FIJO</span>';
    if (turno.estado === 'completado') badges += '<span class="turno-badge badge-completado">PAGADO</span>';
    if (turno.estado === 'cancelado') badges += '<span class="turno-badge badge-cancelado">CANCELADO</span>';

    let actions = '';
    if (turno.estado === 'pendiente') {
        actions = `
            <button class="btn-secondary btn-small btn-success" onclick="completarTurno(${turno.id}, '${turno.servicio_nombre || ''}', ${turno.servicio_precio || 0})">Cobrar</button>
            <button class="btn-secondary btn-small btn-danger" onclick="cancelarTurno(${turno.id})">Cancelar</button>
        `;
    } else if (turno.estado === 'completado') {
        actions = `<span style="color: var(--success); font-weight: 600;">$${turno.monto}</span>`;
    }

    const servicioInfo = turno.servicio_nombre ? `<div style="font-size: 0.8rem; color: var(--primary);">${turno.servicio_nombre}</div>` : '';

    return `
        <div class="turno-card">
            <div class="turno-info">
                <div class="turno-horario">${turno.horario}</div>
                <div class="turno-cliente">${turno.nombre_cliente}${badges}</div>
                ${servicioInfo}
            </div>
            <div class="turno-actions">${actions}</div>
        </div>
    `;
}

// Cargar turnos fijos
async function loadTurnosFijos() {
    const container = document.getElementById('lista-fijos');
    const fijos = await api('/turnos-fijos');

    if (fijos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay turnos fijos configurados</div>';
        return;
    }

    container.innerHTML = fijos.map(f => `
        <div class="lista-item">
            <div class="lista-item-header">
                <span class="lista-item-title">${f.nombre_cliente}</span>
                <div>
                    <button class="btn-secondary btn-small" onclick="editarTurnoFijo(${f.id}, '${f.nombre_cliente}', ${f.dia_semana}, '${f.horario}', ${f.servicio_id || 'null'})">Editar</button>
                    <button class="btn-secondary btn-small btn-danger" onclick="eliminarTurnoFijo(${f.id})">Eliminar</button>
                </div>
            </div>
            <div class="lista-item-subtitle">
                ${DIAS_SEMANA_FULL[f.dia_semana]} a las ${f.horario}
                ${f.servicio_nombre ? ` - ${f.servicio_nombre}` : ''}
            </div>
        </div>
    `).join('');
}

// Cargar precios
async function loadPrecios() {
    const container = document.getElementById('lista-precios');
    await loadServicios();

    container.innerHTML = servicios.map(s => `
        <div class="precio-item">
            <span class="precio-nombre">${s.nombre}</span>
            <div class="precio-input-group">
                <span>$</span>
                <input type="number" class="precio-input" value="${s.precio}"
                       onchange="actualizarPrecio(${s.id}, this.value)" step="0.01">
            </div>
        </div>
    `).join('');
}

async function actualizarPrecio(id, precio) {
    await api(`/servicios/${id}`, {
        method: 'PUT',
        body: { precio: parseFloat(precio) }
    });
    await loadServicios(); // Actualizar cache
}

// Cargar pagos
async function loadPagos() {
    const container = document.getElementById('lista-pagos');
    const fechaInicio = document.getElementById('filtro-fecha-inicio').value;
    const fechaFin = document.getElementById('filtro-fecha-fin').value;
    const medio = document.getElementById('filtro-medio').value;

    let url = '/pagos?';
    if (fechaInicio && fechaFin) url += `fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}&`;
    if (medio) url += `medio_pago=${medio}`;

    const pagos = await api(url);

    if (pagos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay pagos registrados</div>';
        return;
    }

    container.innerHTML = pagos.map(p => `
        <div class="lista-item">
            <div class="lista-item-header">
                <span class="lista-item-title">$${p.monto}</span>
                <span class="turno-badge" style="background: var(--gray-200);">${p.medio_pago}</span>
            </div>
            <div class="lista-item-subtitle">
                ${p.nombre_cliente} - ${p.fecha}
                ${p.servicio_nombre ? ` - ${p.servicio_nombre}` : ''}
            </div>
        </div>
    `).join('');
}

document.getElementById('btn-filtrar-pagos').addEventListener('click', loadPagos);

// Cargar métricas
async function loadMetricas() {
    const fechaInicio = document.getElementById('metricas-fecha-inicio').value;
    const fechaFin = document.getElementById('metricas-fecha-fin').value;

    if (!fechaInicio || !fechaFin) {
        alert('Seleccioná un rango de fechas');
        return;
    }

    const metricas = await api(`/metricas?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);

    document.getElementById('metrica-total').textContent = `$${metricas.total.toLocaleString()}`;

    // Por medio de pago
    const medios = { efectivo: 0, transferencia: 0, mercadopago: 0 };
    metricas.por_medio_pago.forEach(m => {
        medios[m.medio_pago] = m.total;
    });
    document.getElementById('metrica-efectivo').textContent = `$${medios.efectivo.toLocaleString()}`;
    document.getElementById('metrica-transferencia').textContent = `$${medios.transferencia.toLocaleString()}`;
    document.getElementById('metrica-mercadopago').textContent = `$${medios.mercadopago.toLocaleString()}`;

    // Stats de turnos
    const statsContainer = document.getElementById('turnos-stats');
    statsContainer.innerHTML = metricas.turnos_por_estado.map(t =>
        `<div class="stat-item">${t.estado}: ${t.cantidad}</div>`
    ).join('');

    // Gráfico por día
    const chartContainer = document.getElementById('ingresos-por-dia');
    if (metricas.por_dia.length === 0) {
        chartContainer.innerHTML = '<div class="empty-state">Sin datos</div>';
    } else {
        const maxTotal = Math.max(...metricas.por_dia.map(d => d.total));
        chartContainer.innerHTML = metricas.por_dia.map(d => {
            const width = maxTotal > 0 ? (d.total / maxTotal) * 100 : 0;
            const fecha = new Date(d.fecha + 'T00:00:00');
            return `
                <div class="chart-bar">
                    <span class="chart-bar-label">${fecha.getDate()}/${fecha.getMonth() + 1}</span>
                    <div class="chart-bar-fill" style="width: ${Math.max(width, 10)}%">
                        <span class="chart-bar-value">$${d.total.toLocaleString()}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}

document.getElementById('btn-cargar-metricas').addEventListener('click', loadMetricas);

// Modales
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal.id);
    });
});

// Nuevo turno
document.getElementById('btn-nuevo-turno').addEventListener('click', async () => {
    document.getElementById('modal-turno-titulo').textContent = 'Nuevo Turno';
    document.getElementById('form-turno').reset();
    document.getElementById('turno-id').value = '';
    document.getElementById('turno-fecha').value = formatDate(currentDate);
    await loadServicios();
    populateServiciosSelect('turno-tipo');
    populateHorariosSelect('turno-horario');
    openModal('modal-turno');
});

document.getElementById('form-turno').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('turno-id').value;
    const data = {
        nombre_cliente: document.getElementById('turno-cliente').value,
        fecha: document.getElementById('turno-fecha').value,
        horario: document.getElementById('turno-horario').value,
        servicio_id: parseInt(document.getElementById('turno-tipo').value)
    };

    if (id) {
        await api(`/turnos/${id}`, { method: 'PUT', body: data });
    } else {
        await api('/turnos', { method: 'POST', body: data });
    }

    closeModal('modal-turno');
    loadAgenda();
});

// Nuevo turno fijo
document.getElementById('btn-nuevo-fijo').addEventListener('click', async () => {
    document.getElementById('modal-fijo-titulo').textContent = 'Nuevo Turno Fijo';
    document.getElementById('form-fijo').reset();
    document.getElementById('fijo-id').value = '';
    await loadServicios();
    populateServiciosSelect('fijo-tipo');
    populateHorariosSelect('fijo-horario');
    openModal('modal-fijo');
});

document.getElementById('form-fijo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('fijo-id').value;
    const data = {
        nombre_cliente: document.getElementById('fijo-cliente').value,
        dia_semana: parseInt(document.getElementById('fijo-dia').value),
        horario: document.getElementById('fijo-horario').value,
        servicio_id: parseInt(document.getElementById('fijo-tipo').value)
    };

    if (id) {
        await api(`/turnos-fijos/${id}`, { method: 'PUT', body: data });
    } else {
        await api('/turnos-fijos', { method: 'POST', body: data });
    }

    closeModal('modal-fijo');
    loadTurnosFijos();
});

async function editarTurnoFijo(id, nombre, dia, horario, servicioId) {
    document.getElementById('modal-fijo-titulo').textContent = 'Editar Turno Fijo';
    document.getElementById('fijo-id').value = id;
    document.getElementById('fijo-cliente').value = nombre;
    document.getElementById('fijo-dia').value = dia;
    await loadServicios();
    populateServiciosSelect('fijo-tipo');
    populateHorariosSelect('fijo-horario', horario);
    if (servicioId) {
        document.getElementById('fijo-tipo').value = servicioId;
    }
    openModal('modal-fijo');
}

async function eliminarTurnoFijo(id) {
    if (confirm('¿Eliminar este turno fijo?')) {
        await api(`/turnos-fijos/${id}`, { method: 'DELETE' });
        loadTurnosFijos();
    }
}

// Completar turno (cobrar)
function completarTurno(id, servicioNombre, servicioPrecio) {
    document.getElementById('pago-turno-id').value = id;
    document.getElementById('pago-servicio').value = servicioNombre || 'Sin servicio definido';
    document.getElementById('pago-monto').value = servicioPrecio || '';
    document.getElementById('pago-medio').value = 'efectivo';
    openModal('modal-pago');
}

document.getElementById('form-pago').addEventListener('submit', async (e) => {
    e.preventDefault();
    const turnoId = document.getElementById('pago-turno-id').value;
    const data = {
        monto: parseFloat(document.getElementById('pago-monto').value),
        medio_pago: document.getElementById('pago-medio').value
    };

    await api(`/turnos/${turnoId}/completar`, { method: 'POST', body: data });
    closeModal('modal-pago');
    loadAgenda();
});

// Cancelar turno
async function cancelarTurno(id) {
    if (confirm('¿Cancelar este turno?')) {
        await api(`/turnos/${id}/cancelar`, { method: 'POST' });
        loadAgenda();
    }
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Cargar servicios inicialmente
        await loadServicios();

        // Setear fechas por defecto en filtros
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        document.getElementById('filtro-fecha-inicio').value = formatDate(firstOfMonth);
        document.getElementById('filtro-fecha-fin').value = formatDate(today);
        document.getElementById('metricas-fecha-inicio').value = formatDate(firstOfMonth);
        document.getElementById('metricas-fecha-fin').value = formatDate(today);

        await loadAgenda();
    } catch (error) {
        console.error('Error en inicialización:', error);
    }
});
