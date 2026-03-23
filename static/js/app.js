// ============================================
// MALTA BARBERSHOP - Apple Calendar Style
// ============================================

// ============================================
// SECTION 1: CONFIGURATION
// ============================================
const CONFIG = {
    HOURS_START: 9,
    HOURS_END: 22,
    SLOT_MINUTES: 30,
    DEFAULT_DURATION: 60,
    DURATIONS: [30, 60],
    DAYS: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    DAYS_FULL: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    MONTHS: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
};

// ============================================
// SECTION 2: STATE MANAGEMENT
// ============================================
const CalendarState = (function() {
    let state = {
        currentDate: new Date(),
        viewMode: 'week', // 'day' | 'week' | 'agenda'
        events: [],
        servicios: [],
        showSunday: false,
        searchQuery: '',
        selectedEvent: null,
        isDragging: false,
    };

    const listeners = new Set();

    return {
        get: (key) => state[key],
        set: (key, value) => {
            state[key] = value;
            listeners.forEach(fn => fn(key, value));
        },
        getAll: () => ({ ...state }),
        subscribe: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        }
    };
})();

// ============================================
// SECTION 3: UTILITIES
// ============================================
const Utils = {
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    formatDateDisplay(date) {
        const month = CONFIG.MONTHS[date.getMonth()];
        const year = date.getFullYear();
        return `${month} ${year}`;
    },

    formatDayHeader(date) {
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        return date.toLocaleDateString('es-AR', options);
    },

    formatTime(date) {
        return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    },

    parseTimeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    },

    minutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    },

    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    },

    getWeekEnd(date) {
        const start = this.getWeekStart(date);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return end;
    },

    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    },

    isPast(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const check = new Date(date);
        check.setHours(0, 0, 0, 0);
        return check < today;
    },

    isSameDay(d1, d2) {
        return d1.toDateString() === d2.toDateString();
    },

    addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    },

    debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }
};

// ============================================
// SECTION 4: API LAYER
// ============================================
const API = {
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`/api${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                ...options,
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('API Error:', endpoint, error);
            throw error;
        }
    },

    getServicios() {
        return this.request('/servicios');
    },

    getTurnos(fechaInicio, fechaFin) {
        return this.request(`/turnos?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
    },

    createTurno(data) {
        return this.request('/turnos', { method: 'POST', body: data });
    },

    updateTurno(id, data) {
        return this.request(`/turnos/${id}`, { method: 'PUT', body: data });
    },

    completarTurno(id, monto, medioPago) {
        return this.request(`/turnos/${id}/completar`, {
            method: 'POST',
            body: { monto, medio_pago: medioPago }
        });
    },

    cancelarTurno(id) {
        return this.request(`/turnos/${id}/cancelar`, { method: 'POST' });
    },

    generarTurnosSemana(fechaInicio) {
        return this.request('/generar-turnos-semana', {
            method: 'POST',
            body: { fecha_inicio: fechaInicio }
        });
    },

    getTurnosFijos() {
        return this.request('/turnos-fijos');
    },

    createTurnoFijo(data) {
        return this.request('/turnos-fijos', { method: 'POST', body: data });
    },

    updateTurnoFijo(id, data) {
        return this.request(`/turnos-fijos/${id}`, { method: 'PUT', body: data });
    },

    deleteTurnoFijo(id) {
        return this.request(`/turnos-fijos/${id}`, { method: 'DELETE' });
    },

    updateServicio(id, precio) {
        return this.request(`/servicios/${id}`, { method: 'PUT', body: { precio } });
    },

    getPagos(fechaInicio, fechaFin, medio) {
        let url = '/pagos?';
        if (fechaInicio && fechaFin) url += `fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}&`;
        if (medio) url += `medio_pago=${medio}`;
        return this.request(url);
    },

    getMetricas(fechaInicio, fechaFin) {
        return this.request(`/metricas?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
    }
};

// ============================================
// SECTION 5: CALENDAR RENDERER
// ============================================
const CalendarRenderer = {
    init() {
        this.container = document.getElementById('calendar');
        this.title = document.getElementById('cal-title');
        this.weekHeader = document.getElementById('cal-week-header');
        this.gridWrapper = document.getElementById('cal-grid-wrapper');
        this.grid = document.getElementById('cal-grid');
        this.agendaContainer = document.getElementById('cal-agenda');
        this.currentTimeIndicator = document.getElementById('cal-current-time');

        // Start current time updates
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    },

    render() {
        const viewMode = CalendarState.get('viewMode');
        const currentDate = CalendarState.get('currentDate');
        const events = this.getFilteredEvents();

        // Update title
        this.updateTitle();

        // Update view class
        this.container.className = `cal cal--${viewMode}`;

        // Show/hide containers
        this.gridWrapper.style.display = viewMode === 'agenda' ? 'none' : 'block';
        this.agendaContainer.style.display = viewMode === 'agenda' ? 'block' : 'none';

        if (viewMode === 'agenda') {
            this.renderAgendaView(events);
        } else {
            this.renderGridView(viewMode, events);
        }

        this.updateCurrentTime();
    },

    getFilteredEvents() {
        const events = CalendarState.get('events');
        const query = CalendarState.get('searchQuery').toLowerCase();
        if (!query) return events;
        return events.filter(e =>
            e.nombre_cliente.toLowerCase().includes(query) ||
            (e.servicio_nombre && e.servicio_nombre.toLowerCase().includes(query))
        );
    },

    updateTitle() {
        const viewMode = CalendarState.get('viewMode');
        const currentDate = CalendarState.get('currentDate');

        if (viewMode === 'day') {
            this.title.textContent = Utils.formatDayHeader(currentDate);
        } else if (viewMode === 'week') {
            const start = Utils.getWeekStart(currentDate);
            const end = Utils.getWeekEnd(currentDate);
            if (start.getMonth() === end.getMonth()) {
                this.title.textContent = `${start.getDate()} - ${end.getDate()} ${CONFIG.MONTHS[start.getMonth()]} ${start.getFullYear()}`;
            } else {
                this.title.textContent = `${start.getDate()} ${CONFIG.MONTHS[start.getMonth()].substring(0, 3)} - ${end.getDate()} ${CONFIG.MONTHS[end.getMonth()].substring(0, 3)} ${start.getFullYear()}`;
            }
        } else {
            this.title.textContent = Utils.formatDateDisplay(currentDate);
        }
    },

    renderGridView(viewMode, events) {
        const currentDate = CalendarState.get('currentDate');
        const showSunday = CalendarState.get('showSunday');

        // Calculate dates for columns
        let dates = [];
        if (viewMode === 'day') {
            dates = [currentDate];
        } else {
            const weekStart = Utils.getWeekStart(currentDate);
            const numDays = showSunday ? 7 : 6;
            for (let i = 0; i < numDays; i++) {
                dates.push(Utils.addDays(weekStart, i));
            }
        }

        // Calculate grid template based on view and showSunday
        const numCols = dates.length;
        const gridTemplate = `var(--cal-time-gutter) repeat(${numCols}, 1fr)`;

        // Render week header with same grid template
        this.renderWeekHeader(dates, viewMode, gridTemplate);

        // Render grid with same grid template
        this.renderGrid(dates, events, viewMode, gridTemplate);
    },

    renderWeekHeader(dates, viewMode, gridTemplate) {
        this.weekHeader.className = 'cal__week-header';
        this.weekHeader.style.gridTemplateColumns = gridTemplate;

        let html = '<div class="cal__week-header-gutter"></div>';

        dates.forEach(date => {
            const dayIndex = (date.getDay() + 6) % 7; // Convert to Monday=0
            const isToday = Utils.isToday(date);

            html += `
                <div class="cal__week-header-day ${isToday ? 'is-today' : ''}" data-date="${Utils.formatDate(date)}">
                    <span class="cal__day-name">${CONFIG.DAYS[dayIndex]}</span>
                    <span class="cal__day-number">${date.getDate()}</span>
                </div>
            `;
        });

        this.weekHeader.innerHTML = html;
    },

    renderGrid(dates, events, viewMode, gridTemplate) {
        this.grid.className = 'cal__grid';
        this.grid.style.gridTemplateColumns = gridTemplate;

        const totalHours = CONFIG.HOURS_END - CONFIG.HOURS_START;
        const gridHeight = `calc(var(--cal-hour-height) * ${totalHours})`;
        this.grid.style.minHeight = gridHeight;

        let html = '';

        // Time gutter
        html += '<div class="cal__time-gutter">';
        for (let h = CONFIG.HOURS_START; h <= CONFIG.HOURS_END; h++) {
            const top = (h - CONFIG.HOURS_START) * 60; // in minutes from start
            const topPercent = (top / (totalHours * 60)) * 100;
            html += `<span class="cal__time-label" style="top: ${topPercent}%">${h.toString().padStart(2, '0')}:00</span>`;
        }
        html += '</div>';

        // Day columns
        dates.forEach(date => {
            const dateStr = Utils.formatDate(date);
            const isToday = Utils.isToday(date);
            const isPast = Utils.isPast(date);
            const dayEvents = events.filter(e => e.fecha === dateStr);

            html += `<div class="cal__day-column ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}" data-date="${dateStr}">`;

            // Hour lines
            for (let h = CONFIG.HOURS_START; h <= CONFIG.HOURS_END; h++) {
                const topPercent = ((h - CONFIG.HOURS_START) / totalHours) * 100;
                html += `<div class="cal__hour-line" style="top: ${topPercent}%"></div>`;
                if (h < CONFIG.HOURS_END) {
                    const halfTopPercent = ((h - CONFIG.HOURS_START + 0.5) / totalHours) * 100;
                    html += `<div class="cal__half-hour-line" style="top: ${halfTopPercent}%"></div>`;
                }
            }

            // Time slots for click-to-create
            for (let h = CONFIG.HOURS_START; h < CONFIG.HOURS_END; h++) {
                for (let m = 0; m < 60; m += CONFIG.SLOT_MINUTES) {
                    const minutes = h * 60 + m;
                    const topPercent = ((minutes - CONFIG.HOURS_START * 60) / (totalHours * 60)) * 100;
                    const heightPercent = (CONFIG.SLOT_MINUTES / (totalHours * 60)) * 100;
                    const time = Utils.minutesToTime(minutes);
                    html += `<div class="cal__time-slot" data-date="${dateStr}" data-time="${time}"
                             style="top: ${topPercent}%; height: ${heightPercent}%"></div>`;
                }
            }

            // Render events with overlap handling
            html += this.renderDayEvents(dayEvents, totalHours);

            html += '</div>';
        });

        this.grid.innerHTML = html;

        // Attach event handlers
        this.attachGridEvents();
    },

    renderDayEvents(events, totalHours) {
        if (!events.length) return '';

        // Sort by time
        const sorted = [...events].sort((a, b) =>
            Utils.parseTimeToMinutes(a.horario) - Utils.parseTimeToMinutes(b.horario)
        );

        // Detect overlaps
        const overlaps = this.detectOverlaps(sorted);

        let html = '';
        sorted.forEach(event => {
            const overlap = overlaps.get(event.id) || { count: 1, index: 0 };
            html += this.renderEvent(event, totalHours, overlap);
        });

        return html;
    },

    detectOverlaps(events) {
        const overlaps = new Map();
        const groups = [];

        events.forEach(event => {
            const start = Utils.parseTimeToMinutes(event.horario);
            const end = start + (event.duracion || CONFIG.DEFAULT_DURATION);

            // Find overlapping group
            let foundGroup = null;
            for (const group of groups) {
                const overlapsGroup = group.some(e => {
                    const eStart = Utils.parseTimeToMinutes(e.horario);
                    const eEnd = eStart + (e.duracion || CONFIG.DEFAULT_DURATION);
                    return start < eEnd && end > eStart;
                });
                if (overlapsGroup) {
                    foundGroup = group;
                    break;
                }
            }

            if (foundGroup) {
                foundGroup.push(event);
            } else {
                groups.push([event]);
            }
        });

        // Assign overlap info
        groups.forEach(group => {
            group.forEach((event, index) => {
                overlaps.set(event.id, { count: group.length, index });
            });
        });

        return overlaps;
    },

    renderEvent(event, totalHours, overlap) {
        const startMinutes = Utils.parseTimeToMinutes(event.horario);
        const dayStartMinutes = CONFIG.HOURS_START * 60;
        const duration = event.duracion || CONFIG.DEFAULT_DURATION;

        // Add small gap (2px top, 2px bottom) via calc
        const topPercent = ((startMinutes - dayStartMinutes) / (totalHours * 60)) * 100;
        const heightPercent = (duration / (totalHours * 60)) * 100;
        const minHeightPercent = (CONFIG.SLOT_MINUTES / (totalHours * 60)) * 100;

        // Calculate width and left for overlaps
        const width = overlap.count > 1 ? `calc(${100 / overlap.count}% - 3px)` : 'calc(100% - 4px)';
        const left = overlap.count > 1 ? `calc(${(100 / overlap.count) * overlap.index}% + 2px)` : '2px';

        const estadoClass = event.estado === 'completado' ? 'cal__event--completado' :
            event.estado === 'cancelado' ? 'cal__event--cancelado' : 'cal__event--pending';

        let badges = '';
        if (event.turno_fijo_id) badges += '<span class="cal__event__badge">FIJO</span>';
        if (event.estado === 'completado') badges += '<span class="cal__event__badge">PAGADO</span>';
        if (event.estado === 'cancelado') badges += '<span class="cal__event__badge">CANCELADO</span>';

        return `
            <div class="cal__event ${estadoClass}"
                 data-event-id="${event.id}"
                 data-overlap="${overlap.count}"
                 data-overlap-index="${overlap.index}"
                 draggable="${event.estado === 'pendiente'}"
                 style="top: calc(${topPercent}% + 2px); height: calc(${heightPercent}% - 4px); width: ${width}; left: ${left};">
                <span class="cal__event__title">${event.nombre_cliente}</span>
                ${event.servicio_nombre ? `<span class="cal__event__service">${event.servicio_nombre}</span>` : ''}
                ${badges ? `<div class="cal__event__badges">${badges}</div>` : ''}
                ${event.estado === 'pendiente' ? '<div class="cal__event__resize"></div>' : ''}
            </div>
        `;
    },

    renderAgendaView(events) {
        const currentDate = CalendarState.get('currentDate');
        const weekStart = Utils.getWeekStart(currentDate);
        const showSunday = CalendarState.get('showSunday');
        const numDays = showSunday ? 7 : 6;

        // Group events by date
        const eventsByDate = new Map();
        for (let i = 0; i < numDays; i++) {
            const date = Utils.addDays(weekStart, i);
            const dateStr = Utils.formatDate(date);
            eventsByDate.set(dateStr, []);
        }

        events.forEach(event => {
            if (eventsByDate.has(event.fecha)) {
                eventsByDate.get(event.fecha).push(event);
            }
        });

        let html = '';
        eventsByDate.forEach((dayEvents, dateStr) => {
            const date = new Date(dateStr + 'T00:00:00');
            const isToday = Utils.isToday(date);
            const dayIndex = (date.getDay() + 6) % 7;

            html += `
                <div class="cal__agenda-day">
                    <div class="cal__agenda-date ${isToday ? 'is-today' : ''}">
                        ${CONFIG.DAYS_FULL[dayIndex]} ${date.getDate()} de ${CONFIG.MONTHS[date.getMonth()]}
                    </div>
            `;

            if (dayEvents.length === 0) {
                html += '<div class="cal__agenda-empty">Sin turnos</div>';
            } else {
                // Sort by time
                dayEvents.sort((a, b) =>
                    Utils.parseTimeToMinutes(a.horario) - Utils.parseTimeToMinutes(b.horario)
                );

                dayEvents.forEach(event => {
                    const estadoClass = `cal__agenda-event__indicator--${event.estado}`;

                    let badges = '';
                    if (event.turno_fijo_id) badges += '<span class="turno-badge badge-fijo">FIJO</span>';
                    if (event.estado === 'completado') badges += '<span class="turno-badge badge-completado">PAGADO</span>';
                    if (event.estado === 'cancelado') badges += '<span class="turno-badge badge-cancelado">CANCELADO</span>';

                    html += `
                        <div class="cal__agenda-event" data-event-id="${event.id}">
                            <span class="cal__agenda-event__time">${event.horario}</span>
                            <div class="cal__agenda-event__indicator ${estadoClass}"></div>
                            <div class="cal__agenda-event__content">
                                <div class="cal__agenda-event__title">${event.nombre_cliente}</div>
                                ${event.servicio_nombre ? `<div class="cal__agenda-event__service">${event.servicio_nombre}</div>` : ''}
                                ${badges ? `<div class="cal__agenda-event__badges">${badges}</div>` : ''}
                            </div>
                        </div>
                    `;
                });
            }

            html += '</div>';
        });

        this.agendaContainer.innerHTML = html;

        // Attach click handlers for agenda events
        this.agendaContainer.querySelectorAll('.cal__agenda-event').forEach(el => {
            el.addEventListener('click', (e) => {
                const eventId = parseInt(el.dataset.eventId);
                const event = CalendarState.get('events').find(ev => ev.id === eventId);
                if (event) PopoverManager.show(event, el);
            });
        });
    },

    updateCurrentTime() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const dayStartMinutes = CONFIG.HOURS_START * 60;
        const dayEndMinutes = CONFIG.HOURS_END * 60;
        const totalMinutes = dayEndMinutes - dayStartMinutes;

        if (currentMinutes < dayStartMinutes || currentMinutes > dayEndMinutes) {
            this.currentTimeIndicator.style.display = 'none';
            return;
        }

        const viewMode = CalendarState.get('viewMode');
        if (viewMode === 'agenda') {
            this.currentTimeIndicator.style.display = 'none';
            return;
        }

        const topPercent = ((currentMinutes - dayStartMinutes) / totalMinutes) * 100;
        this.currentTimeIndicator.style.display = 'block';
        this.currentTimeIndicator.style.top = `${topPercent}%`;
    },

    attachGridEvents() {
        // Event clicks
        this.grid.querySelectorAll('.cal__event').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = parseInt(el.dataset.eventId);
                const event = CalendarState.get('events').find(ev => ev.id === eventId);
                if (event) PopoverManager.show(event, el);
            });
        });

        // Time slot clicks for creating events
        this.grid.querySelectorAll('.cal__time-slot').forEach(slot => {
            slot.addEventListener('click', (e) => {
                const date = slot.dataset.date;
                const time = slot.dataset.time;
                ModalManager.openTurnoModal(null, date, time);
            });
        });

        // Drag and drop
        DragDropManager.init();
    },

    scrollToCurrentTime() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const dayStartMinutes = CONFIG.HOURS_START * 60;

        if (currentMinutes >= dayStartMinutes) {
            const totalMinutes = (CONFIG.HOURS_END - CONFIG.HOURS_START) * 60;
            const scrollPercent = (currentMinutes - dayStartMinutes) / totalMinutes;
            const scrollTop = this.gridWrapper.scrollHeight * scrollPercent - this.gridWrapper.clientHeight / 3;
            this.gridWrapper.scrollTop = Math.max(0, scrollTop);
        }
    }
};

// ============================================
// SECTION 6: DRAG & DROP MANAGER
// ============================================
const DragDropManager = {
    dragState: null,

    init() {
        const grid = document.getElementById('cal-grid');

        grid.querySelectorAll('.cal__event[draggable="true"]').forEach(el => {
            el.addEventListener('dragstart', (e) => this.onDragStart(e, el));
            el.addEventListener('dragend', (e) => this.onDragEnd(e, el));
        });

        grid.querySelectorAll('.cal__time-slot').forEach(slot => {
            slot.addEventListener('dragover', (e) => this.onDragOver(e, slot));
            slot.addEventListener('dragleave', (e) => this.onDragLeave(e, slot));
            slot.addEventListener('drop', (e) => this.onDrop(e, slot));
        });
    },

    onDragStart(e, el) {
        const eventId = parseInt(el.dataset.eventId);
        const event = CalendarState.get('events').find(ev => ev.id === eventId);

        this.dragState = {
            event,
            element: el,
            originalDate: event.fecha,
            originalTime: event.horario
        };

        el.classList.add('cal__event--dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', eventId);
    },

    onDragEnd(e, el) {
        el.classList.remove('cal__event--dragging');
        this.dragState = null;

        // Remove all drop targets
        document.querySelectorAll('.cal__time-slot.is-drop-target').forEach(slot => {
            slot.classList.remove('is-drop-target');
        });
    },

    onDragOver(e, slot) {
        e.preventDefault();
        slot.classList.add('is-drop-target');
    },

    onDragLeave(e, slot) {
        slot.classList.remove('is-drop-target');
    },

    async onDrop(e, slot) {
        e.preventDefault();
        slot.classList.remove('is-drop-target');

        if (!this.dragState) return;

        const newDate = slot.dataset.date;
        const newTime = slot.dataset.time;
        const event = this.dragState.event;

        // Only update if changed
        if (newDate !== event.fecha || newTime !== event.horario) {
            try {
                await API.updateTurno(event.id, {
                    ...event,
                    fecha: newDate,
                    horario: newTime
                });
                await CalendarApp.loadEvents();
            } catch (error) {
                console.error('Error moving event:', error);
            }
        }

        this.dragState = null;
    }
};

// ============================================
// SECTION 6B: SWIPE MANAGER (Mobile Navigation)
// ============================================
const SwipeManager = {
    startX: 0,
    startY: 0,
    threshold: 50,
    allowedTime: 300,
    startTime: 0,

    init() {
        const calBody = document.getElementById('cal-body');
        if (!calBody) return;

        calBody.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
        calBody.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: true });
    },

    onTouchStart(e) {
        const touch = e.changedTouches[0];
        this.startX = touch.pageX;
        this.startY = touch.pageY;
        this.startTime = Date.now();
    },

    onTouchEnd(e) {
        const touch = e.changedTouches[0];
        const distX = touch.pageX - this.startX;
        const distY = touch.pageY - this.startY;
        const elapsedTime = Date.now() - this.startTime;

        // Check if it's a valid horizontal swipe
        if (elapsedTime <= this.allowedTime &&
            Math.abs(distX) >= this.threshold &&
            Math.abs(distX) > Math.abs(distY)) {

            if (distX > 0) {
                // Swipe right - go to previous
                CalendarApp.navigate(-1);
            } else {
                // Swipe left - go to next
                CalendarApp.navigate(1);
            }
        }
    }
};

// ============================================
// SECTION 7: POPOVER MANAGER
// ============================================
const PopoverManager = {
    currentPopover: null,

    show(event, anchorEl) {
        this.close();

        const rect = anchorEl.getBoundingClientRect();
        const popover = document.createElement('div');
        popover.className = 'cal__popover';

        const servicioText = event.servicio_nombre || 'Sin servicio';
        const dateObj = new Date(event.fecha + 'T00:00:00');
        const dayIndex = (dateObj.getDay() + 6) % 7;
        const dateText = `${CONFIG.DAYS_FULL[dayIndex]} ${dateObj.getDate()} de ${CONFIG.MONTHS[dateObj.getMonth()]}`;
        const duracionText = event.duracion ? `${event.duracion} min` : '60 min';

        let actionsHtml = '';
        if (event.estado === 'pendiente') {
            actionsHtml = `
                <button class="cal__popover__btn cal__popover__btn--primary" data-action="cobrar">Cobrar</button>
                <button class="cal__popover__btn cal__popover__btn--secondary" data-action="editar">Editar</button>
                <button class="cal__popover__btn cal__popover__btn--danger" data-action="cancelar">Cancelar</button>
            `;
        } else if (event.estado === 'completado') {
            actionsHtml = `
                <span style="color: var(--sage); font-weight: 600;">Pagado: $${event.monto || 0}</span>
            `;
        } else if (event.estado === 'cancelado') {
            actionsHtml = `
                <span style="color: var(--pole-red); font-weight: 600;">Cancelado</span>
            `;
        }

        popover.innerHTML = `
            <div class="cal__popover__header">
                <div class="cal__popover__title">${event.nombre_cliente}</div>
                <div class="cal__popover__subtitle">${servicioText}</div>
            </div>
            <div class="cal__popover__body">
                <div class="cal__popover__row">
                    <span class="cal__popover__icon">📅</span>
                    <span>${dateText}</span>
                </div>
                <div class="cal__popover__row">
                    <span class="cal__popover__icon">⏰</span>
                    <span>${event.horario} (${duracionText})</span>
                </div>
                ${event.turno_fijo_id ? `
                <div class="cal__popover__row">
                    <span class="cal__popover__icon">🔄</span>
                    <span>Turno fijo semanal</span>
                </div>
                ` : ''}
            </div>
            <div class="cal__popover__actions">
                ${actionsHtml}
                <button class="cal__popover__btn cal__popover__btn--secondary" data-action="close">Cerrar</button>
            </div>
        `;

        document.body.appendChild(popover);

        // Position popover - smarter positioning
        const popoverRect = popover.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 10;

        let top, left;

        // Try right side first
        if (rect.right + padding + popoverRect.width < viewportWidth) {
            left = rect.right + padding;
        }
        // Try left side
        else if (rect.left - padding - popoverRect.width > 0) {
            left = rect.left - popoverRect.width - padding;
        }
        // Center horizontally if neither works
        else {
            left = Math.max(padding, (viewportWidth - popoverRect.width) / 2);
        }

        // Vertical positioning - center on element, but keep in viewport
        top = rect.top + rect.height / 2 - popoverRect.height / 2;

        // Keep within viewport bounds
        if (top < padding) {
            top = padding;
        } else if (top + popoverRect.height > viewportHeight - padding) {
            top = viewportHeight - popoverRect.height - padding;
        }

        // On mobile, position at bottom of screen
        if (viewportWidth < 480) {
            left = padding;
            top = viewportHeight - popoverRect.height - padding;
            popover.style.width = `calc(100vw - ${padding * 2}px)`;
        }

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;

        // Event handlers
        popover.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());

        popover.querySelector('[data-action="cobrar"]')?.addEventListener('click', () => {
            this.close();
            ModalManager.openPagoModal(event);
        });

        popover.querySelector('[data-action="editar"]')?.addEventListener('click', () => {
            this.close();
            ModalManager.openTurnoModal(event);
        });

        popover.querySelector('[data-action="cancelar"]')?.addEventListener('click', async () => {
            if (confirm('¿Cancelar este turno?')) {
                await API.cancelarTurno(event.id);
                this.close();
                await CalendarApp.loadEvents();
            }
        });

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 10);

        this.currentPopover = popover;
    },

    handleOutsideClick(e) {
        if (PopoverManager.currentPopover && !PopoverManager.currentPopover.contains(e.target)) {
            PopoverManager.close();
        }
    },

    close() {
        if (this.currentPopover) {
            this.currentPopover.remove();
            this.currentPopover = null;
        }
        document.removeEventListener('click', this.handleOutsideClick);
    }
};

// ============================================
// SECTION 8: MODAL MANAGER
// ============================================
const ModalManager = {
    init() {
        // Close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(btn.dataset.modal));
        });

        // Click outside to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal.id);
            });
        });

        // Turno form
        document.getElementById('form-turno').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveTurno();
        });

        // Turno Fijo form
        document.getElementById('form-fijo').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveTurnoFijo();
        });

        // Pago form
        document.getElementById('form-pago').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.savePago();
        });
    },

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    },

    async openTurnoModal(event = null, date = null, time = null) {
        const servicios = CalendarState.get('servicios');
        const currentDate = CalendarState.get('currentDate');

        // Populate servicios
        const tipoSelect = document.getElementById('turno-tipo');
        tipoSelect.innerHTML = servicios.map(s =>
            `<option value="${s.id}">${s.nombre}${s.precio > 0 ? ` - $${s.precio}` : ''}</option>`
        ).join('');

        // Populate horarios
        const horarioSelect = document.getElementById('turno-horario');
        const horarios = [];
        for (let h = CONFIG.HOURS_START; h < CONFIG.HOURS_END; h++) {
            horarios.push(`${h.toString().padStart(2, '0')}:00`);
            horarios.push(`${h.toString().padStart(2, '0')}:30`);
        }
        horarioSelect.innerHTML = horarios.map(h =>
            `<option value="${h}" ${time === h ? 'selected' : ''}>${h}</option>`
        ).join('');

        // Set values
        document.getElementById('turno-id').value = event ? event.id : '';
        document.getElementById('turno-cliente').value = event ? event.nombre_cliente : '';
        document.getElementById('turno-fecha').value = date || (event ? event.fecha : Utils.formatDate(currentDate));
        document.getElementById('turno-duracion').value = event?.duracion || CONFIG.DEFAULT_DURATION;

        if (event?.servicio_id) {
            tipoSelect.value = event.servicio_id;
        }
        if (event?.horario) {
            horarioSelect.value = event.horario;
        }

        document.getElementById('modal-turno-titulo').textContent = event ? 'Editar Turno' : 'Nuevo Turno';
        this.openModal('modal-turno');
    },

    async saveTurno() {
        const id = document.getElementById('turno-id').value;
        const data = {
            nombre_cliente: document.getElementById('turno-cliente').value,
            fecha: document.getElementById('turno-fecha').value,
            horario: document.getElementById('turno-horario').value,
            servicio_id: parseInt(document.getElementById('turno-tipo').value),
            duracion: parseInt(document.getElementById('turno-duracion').value)
        };

        if (id) {
            await API.updateTurno(id, data);
        } else {
            await API.createTurno(data);
        }

        this.closeModal('modal-turno');
        await CalendarApp.loadEvents();
    },

    openPagoModal(event) {
        document.getElementById('pago-turno-id').value = event.id;
        document.getElementById('pago-servicio').value = event.servicio_nombre || 'Sin servicio';
        document.getElementById('pago-monto').value = event.servicio_precio || '';
        document.getElementById('pago-medio').value = 'efectivo';
        this.openModal('modal-pago');
    },

    async savePago() {
        const turnoId = document.getElementById('pago-turno-id').value;
        const monto = parseFloat(document.getElementById('pago-monto').value);
        const medioPago = document.getElementById('pago-medio').value;

        await API.completarTurno(turnoId, monto, medioPago);
        this.closeModal('modal-pago');
        await CalendarApp.loadEvents();
    },

    async openFijoModal(fijo = null) {
        const servicios = CalendarState.get('servicios');

        // Populate servicios
        const tipoSelect = document.getElementById('fijo-tipo');
        tipoSelect.innerHTML = servicios.map(s =>
            `<option value="${s.id}">${s.nombre}${s.precio > 0 ? ` - $${s.precio}` : ''}</option>`
        ).join('');

        // Populate horarios
        const horarioSelect = document.getElementById('fijo-horario');
        const horarios = [];
        for (let h = CONFIG.HOURS_START; h < CONFIG.HOURS_END; h++) {
            horarios.push(`${h.toString().padStart(2, '0')}:00`);
            horarios.push(`${h.toString().padStart(2, '0')}:30`);
        }
        horarioSelect.innerHTML = horarios.map(h =>
            `<option value="${h}" ${fijo?.horario === h ? 'selected' : ''}>${h}</option>`
        ).join('');

        // Set values
        document.getElementById('fijo-id').value = fijo ? fijo.id : '';
        document.getElementById('fijo-cliente').value = fijo ? fijo.nombre_cliente : '';
        document.getElementById('fijo-dia').value = fijo ? fijo.dia_semana : 0;

        if (fijo?.servicio_id) {
            tipoSelect.value = fijo.servicio_id;
        }

        document.getElementById('modal-fijo-titulo').textContent = fijo ? 'Editar Turno Fijo' : 'Nuevo Turno Fijo';
        this.openModal('modal-fijo');
    },

    async saveTurnoFijo() {
        const id = document.getElementById('fijo-id').value;
        const data = {
            nombre_cliente: document.getElementById('fijo-cliente').value,
            dia_semana: parseInt(document.getElementById('fijo-dia').value),
            horario: document.getElementById('fijo-horario').value,
            servicio_id: parseInt(document.getElementById('fijo-tipo').value)
        };

        if (id) {
            await API.updateTurnoFijo(id, data);
        } else {
            await API.createTurnoFijo(data);
        }

        this.closeModal('modal-fijo');
        await loadTurnosFijos();
    }
};

// ============================================
// SECTION 9: CALENDAR APP (MAIN)
// ============================================
const CalendarApp = {
    async init() {
        // Load servicios
        const servicios = await API.getServicios();
        CalendarState.set('servicios', servicios);

        // Initialize components
        CalendarRenderer.init();
        ModalManager.init();
        SwipeManager.init();

        // Bind navigation
        document.getElementById('cal-prev').addEventListener('click', () => this.navigate(-1));
        document.getElementById('cal-next').addEventListener('click', () => this.navigate(1));
        document.getElementById('cal-today').addEventListener('click', () => this.goToToday());

        // View switcher
        document.querySelectorAll('.cal__view-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });

        // New event button
        document.getElementById('cal-new-event').addEventListener('click', () => {
            ModalManager.openTurnoModal();
        });

        // Show Sunday toggle
        document.getElementById('mostrar-domingo').addEventListener('change', (e) => {
            CalendarState.set('showSunday', e.target.checked);
            this.loadEvents();
        });

        // Load initial data
        await this.loadEvents();

        // Scroll to current time
        setTimeout(() => CalendarRenderer.scrollToCurrentTime(), 100);
    },

    navigate(direction) {
        const viewMode = CalendarState.get('viewMode');
        const currentDate = CalendarState.get('currentDate');
        const newDate = new Date(currentDate);

        if (viewMode === 'day') {
            newDate.setDate(newDate.getDate() + direction);
        } else {
            newDate.setDate(newDate.getDate() + (direction * 7));
        }

        CalendarState.set('currentDate', newDate);
        this.loadEvents();
    },

    goToToday() {
        CalendarState.set('currentDate', new Date());
        this.loadEvents();
        setTimeout(() => CalendarRenderer.scrollToCurrentTime(), 100);
    },

    setView(view) {
        // Update buttons
        document.querySelectorAll('.cal__view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        CalendarState.set('viewMode', view);
        CalendarRenderer.render();
    },

    async loadEvents() {
        const currentDate = CalendarState.get('currentDate');
        const viewMode = CalendarState.get('viewMode');
        const showSunday = CalendarState.get('showSunday');

        let fechaInicio, fechaFin;

        if (viewMode === 'day') {
            fechaInicio = fechaFin = Utils.formatDate(currentDate);
        } else {
            const weekStart = Utils.getWeekStart(currentDate);
            fechaInicio = Utils.formatDate(weekStart);
            fechaFin = Utils.formatDate(Utils.addDays(weekStart, showSunday ? 6 : 5));
        }

        // Generate turnos from fijos
        await API.generarTurnosSemana(fechaInicio);

        // Load events
        const events = await API.getTurnos(fechaInicio, fechaFin);
        CalendarState.set('events', events);

        CalendarRenderer.render();
    }
};

// ============================================
// SECTION 10: OTHER SECTIONS (Fijos, Precios, Pagos, Métricas)
// ============================================

// Navigation between main sections
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.section).classList.add('active');

        // Load data for section
        if (btn.dataset.section === 'agenda') CalendarApp.loadEvents();
        if (btn.dataset.section === 'turnos-fijos') loadTurnosFijos();
        if (btn.dataset.section === 'precios') loadPrecios();
        if (btn.dataset.section === 'pagos') loadPagos();
    });
});

// Turnos Fijos
async function loadTurnosFijos() {
    const container = document.getElementById('lista-fijos');
    const fijos = await API.getTurnosFijos();

    if (fijos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay turnos fijos configurados</div>';
        return;
    }

    container.innerHTML = fijos.map(f => `
        <div class="lista-item">
            <div class="lista-item-header">
                <span class="lista-item-title">${f.nombre_cliente}</span>
                <div>
                    <button class="btn-secondary btn-small" onclick="editarTurnoFijo(${f.id})">Editar</button>
                    <button class="btn-secondary btn-small btn-danger" onclick="eliminarTurnoFijo(${f.id})">Eliminar</button>
                </div>
            </div>
            <div class="lista-item-subtitle">
                ${CONFIG.DAYS_FULL[f.dia_semana]} a las ${f.horario}
                ${f.servicio_nombre ? ` - ${f.servicio_nombre}` : ''}
            </div>
        </div>
    `).join('');
}

async function editarTurnoFijo(id) {
    const fijos = await API.getTurnosFijos();
    const fijo = fijos.find(f => f.id === id);
    if (fijo) ModalManager.openFijoModal(fijo);
}

async function eliminarTurnoFijo(id) {
    if (confirm('¿Eliminar este turno fijo?')) {
        await API.deleteTurnoFijo(id);
        loadTurnosFijos();
    }
}

document.getElementById('btn-nuevo-fijo').addEventListener('click', () => {
    ModalManager.openFijoModal();
});

// Precios
async function loadPrecios() {
    const container = document.getElementById('lista-precios');
    const servicios = await API.getServicios();
    CalendarState.set('servicios', servicios);

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
    await API.updateServicio(id, parseFloat(precio));
    const servicios = await API.getServicios();
    CalendarState.set('servicios', servicios);
}

// Pagos
async function loadPagos() {
    const container = document.getElementById('lista-pagos');
    const fechaInicio = document.getElementById('filtro-fecha-inicio').value;
    const fechaFin = document.getElementById('filtro-fecha-fin').value;
    const medio = document.getElementById('filtro-medio').value;

    const pagos = await API.getPagos(fechaInicio, fechaFin, medio);

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

// Métricas
async function loadMetricas() {
    const fechaInicio = document.getElementById('metricas-fecha-inicio').value;
    const fechaFin = document.getElementById('metricas-fecha-fin').value;

    if (!fechaInicio || !fechaFin) {
        alert('Seleccioná un rango de fechas');
        return;
    }

    const metricas = await API.getMetricas(fechaInicio, fechaFin);

    document.getElementById('metrica-total').textContent = `$${metricas.total.toLocaleString()}`;

    const medios = { efectivo: 0, transferencia: 0, mercadopago: 0 };
    metricas.por_medio_pago.forEach(m => {
        medios[m.medio_pago] = m.total;
    });
    document.getElementById('metrica-efectivo').textContent = `$${medios.efectivo.toLocaleString()}`;
    document.getElementById('metrica-transferencia').textContent = `$${medios.transferencia.toLocaleString()}`;
    document.getElementById('metrica-mercadopago').textContent = `$${medios.mercadopago.toLocaleString()}`;

    const statsContainer = document.getElementById('turnos-stats');
    statsContainer.innerHTML = metricas.turnos_por_estado.map(t =>
        `<div class="stat-item">${t.estado}: ${t.cantidad}</div>`
    ).join('');

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

// ============================================
// SECTION 11: INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Set default filter dates
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        document.getElementById('filtro-fecha-inicio').value = Utils.formatDate(firstOfMonth);
        document.getElementById('filtro-fecha-fin').value = Utils.formatDate(today);
        document.getElementById('metricas-fecha-inicio').value = Utils.formatDate(firstOfMonth);
        document.getElementById('metricas-fecha-fin').value = Utils.formatDate(today);

        // Initialize calendar app
        await CalendarApp.init();
    } catch (error) {
        console.error('Error en inicialización:', error);
    }
});
