from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)

# Usar PostgreSQL en producción, SQLite en desarrollo
DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db():
    """Obtener conexión a la base de datos."""
    if DATABASE_URL:
        # PostgreSQL (producción)
        import psycopg2
        from psycopg2.extras import RealDictCursor
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    else:
        # SQLite (desarrollo local)
        import sqlite3
        conn = sqlite3.connect('barberia.db')
        conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Inicializar la base de datos con las tablas necesarias."""
    conn = get_db()
    cursor = conn.cursor()

    if DATABASE_URL:
        # PostgreSQL
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS servicios (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL UNIQUE,
                precio REAL NOT NULL,
                activo INTEGER DEFAULT 1
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS turnos_fijos (
                id SERIAL PRIMARY KEY,
                nombre_cliente TEXT NOT NULL,
                dia_semana INTEGER NOT NULL,
                horario TEXT NOT NULL,
                servicio_id INTEGER,
                activo INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (servicio_id) REFERENCES servicios(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS turnos (
                id SERIAL PRIMARY KEY,
                fecha DATE NOT NULL,
                horario TEXT NOT NULL,
                nombre_cliente TEXT NOT NULL,
                servicio_id INTEGER,
                turno_fijo_id INTEGER,
                estado TEXT DEFAULT 'pendiente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (servicio_id) REFERENCES servicios(id),
                FOREIGN KEY (turno_fijo_id) REFERENCES turnos_fijos(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pagos (
                id SERIAL PRIMARY KEY,
                turno_id INTEGER NOT NULL,
                monto REAL NOT NULL,
                medio_pago TEXT NOT NULL,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (turno_id) REFERENCES turnos(id)
            )
        ''')

        # Insertar servicios por defecto
        servicios_default = [
            ('Corte', 0),
            ('Corte + Barba', 0),
            ('Color', 0),
            ('Personalizado', 0)
        ]
        for nombre, precio in servicios_default:
            cursor.execute(
                'INSERT INTO servicios (nombre, precio) VALUES (%s, %s) ON CONFLICT (nombre) DO NOTHING',
                (nombre, precio)
            )
    else:
        # SQLite (desarrollo)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS servicios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL UNIQUE,
                precio REAL NOT NULL,
                activo INTEGER DEFAULT 1
            )
        ''')

        servicios_default = [
            ('Corte', 0),
            ('Corte + Barba', 0),
            ('Color', 0),
            ('Personalizado', 0)
        ]
        for nombre, precio in servicios_default:
            cursor.execute(
                'INSERT OR IGNORE INTO servicios (nombre, precio) VALUES (?, ?)',
                (nombre, precio)
            )

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS turnos_fijos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre_cliente TEXT NOT NULL,
                dia_semana INTEGER NOT NULL,
                horario TEXT NOT NULL,
                servicio_id INTEGER,
                activo INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (servicio_id) REFERENCES servicios(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS turnos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha DATE NOT NULL,
                horario TEXT NOT NULL,
                nombre_cliente TEXT NOT NULL,
                servicio_id INTEGER,
                turno_fijo_id INTEGER,
                estado TEXT DEFAULT 'pendiente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (servicio_id) REFERENCES servicios(id),
                FOREIGN KEY (turno_fijo_id) REFERENCES turnos_fijos(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pagos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                turno_id INTEGER NOT NULL,
                monto REAL NOT NULL,
                medio_pago TEXT NOT NULL,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (turno_id) REFERENCES turnos(id)
            )
        ''')

    conn.commit()
    conn.close()

def query_db(query, params=(), fetchone=False, commit=False):
    """Helper para ejecutar queries compatible con PostgreSQL y SQLite."""
    conn = get_db()
    cursor = conn.cursor()

    # Convertir placeholders de SQLite (?) a PostgreSQL (%s)
    if DATABASE_URL:
        query = query.replace('?', '%s')

    cursor.execute(query, params)

    if commit:
        conn.commit()
        lastrowid = cursor.lastrowid if hasattr(cursor, 'lastrowid') else None
        # Para PostgreSQL, obtener el último ID insertado
        if DATABASE_URL and lastrowid is None and 'INSERT' in query.upper():
            cursor.execute('SELECT lastval()')
            result = cursor.fetchone()
            lastrowid = result['lastval'] if result else None
        conn.close()
        return lastrowid

    if fetchone:
        result = cursor.fetchone()
    else:
        result = cursor.fetchall()

    conn.close()

    # Convertir a dict para compatibilidad
    if result:
        if fetchone:
            return dict(result)
        else:
            return [dict(row) for row in result]
    return [] if not fetchone else None

# ============ RUTAS DE PÁGINAS ============

@app.route('/')
def index():
    return render_template('index.html')

# ============ API SERVICIOS ============

@app.route('/api/servicios', methods=['GET'])
def get_servicios():
    servicios = query_db('SELECT * FROM servicios WHERE activo = 1 ORDER BY id')
    return jsonify(servicios)

@app.route('/api/servicios/<int:id>', methods=['PUT'])
def update_servicio(id):
    data = request.json
    query_db('UPDATE servicios SET precio = ? WHERE id = ?', (data['precio'], id), commit=True)
    return jsonify({'message': 'Precio actualizado'})

# ============ API TURNOS FIJOS ============

@app.route('/api/turnos-fijos', methods=['GET'])
def get_turnos_fijos():
    turnos = query_db('''
        SELECT tf.*, s.nombre as servicio_nombre, s.precio as servicio_precio
        FROM turnos_fijos tf
        LEFT JOIN servicios s ON tf.servicio_id = s.id
        WHERE tf.activo = 1
        ORDER BY tf.dia_semana, tf.horario
    ''')
    return jsonify(turnos)

@app.route('/api/turnos-fijos', methods=['POST'])
def create_turno_fijo():
    data = request.json
    turno_id = query_db(
        'INSERT INTO turnos_fijos (nombre_cliente, dia_semana, horario, servicio_id) VALUES (?, ?, ?, ?)',
        (data['nombre_cliente'], data['dia_semana'], data['horario'], data.get('servicio_id')),
        commit=True
    )
    return jsonify({'id': turno_id, 'message': 'Turno fijo creado'}), 201

@app.route('/api/turnos-fijos/<int:id>', methods=['PUT'])
def update_turno_fijo(id):
    data = request.json
    query_db(
        'UPDATE turnos_fijos SET nombre_cliente = ?, dia_semana = ?, horario = ?, servicio_id = ? WHERE id = ?',
        (data['nombre_cliente'], data['dia_semana'], data['horario'], data.get('servicio_id'), id),
        commit=True
    )
    return jsonify({'message': 'Turno fijo actualizado'})

@app.route('/api/turnos-fijos/<int:id>', methods=['DELETE'])
def delete_turno_fijo(id):
    query_db('UPDATE turnos_fijos SET activo = 0 WHERE id = ?', (id,), commit=True)
    return jsonify({'message': 'Turno fijo eliminado'})

# ============ API TURNOS ============

@app.route('/api/turnos', methods=['GET'])
def get_turnos():
    fecha_inicio = request.args.get('fecha_inicio')
    fecha_fin = request.args.get('fecha_fin')

    if fecha_inicio and fecha_fin:
        turnos = query_db(
            '''SELECT t.*, p.monto, p.medio_pago, s.nombre as servicio_nombre, s.precio as servicio_precio
               FROM turnos t
               LEFT JOIN pagos p ON t.id = p.turno_id
               LEFT JOIN servicios s ON t.servicio_id = s.id
               WHERE t.fecha BETWEEN ? AND ?
               ORDER BY t.fecha, t.horario''',
            (fecha_inicio, fecha_fin)
        )
    else:
        turnos = query_db(
            '''SELECT t.*, p.monto, p.medio_pago, s.nombre as servicio_nombre, s.precio as servicio_precio
               FROM turnos t
               LEFT JOIN pagos p ON t.id = p.turno_id
               LEFT JOIN servicios s ON t.servicio_id = s.id
               ORDER BY t.fecha DESC, t.horario LIMIT 100'''
        )

    return jsonify(turnos)

@app.route('/api/turnos', methods=['POST'])
def create_turno():
    data = request.json
    turno_id = query_db(
        'INSERT INTO turnos (fecha, horario, nombre_cliente, servicio_id, turno_fijo_id, estado) VALUES (?, ?, ?, ?, ?, ?)',
        (data['fecha'], data['horario'], data['nombre_cliente'], data.get('servicio_id'), data.get('turno_fijo_id'), 'pendiente'),
        commit=True
    )
    return jsonify({'id': turno_id, 'message': 'Turno creado'}), 201

@app.route('/api/turnos/<int:id>', methods=['PUT'])
def update_turno(id):
    data = request.json
    query_db(
        'UPDATE turnos SET fecha = ?, horario = ?, nombre_cliente = ?, servicio_id = ?, estado = ? WHERE id = ?',
        (data['fecha'], data['horario'], data['nombre_cliente'], data.get('servicio_id'), data.get('estado', 'pendiente'), id),
        commit=True
    )
    return jsonify({'message': 'Turno actualizado'})

@app.route('/api/turnos/<int:id>/cancelar', methods=['POST'])
def cancelar_turno(id):
    query_db('UPDATE turnos SET estado = ? WHERE id = ?', ('cancelado', id), commit=True)
    return jsonify({'message': 'Turno cancelado'})

@app.route('/api/turnos/<int:id>/completar', methods=['POST'])
def completar_turno(id):
    data = request.json
    query_db('UPDATE turnos SET estado = ? WHERE id = ?', ('completado', id), commit=True)
    query_db(
        'INSERT INTO pagos (turno_id, monto, medio_pago) VALUES (?, ?, ?)',
        (id, data['monto'], data['medio_pago']),
        commit=True
    )
    return jsonify({'message': 'Turno completado y pago registrado'})

# ============ API GENERAR TURNOS DESDE FIJOS ============

@app.route('/api/generar-turnos-semana', methods=['POST'])
def generar_turnos_semana():
    """Genera los turnos de la semana actual basándose en los turnos fijos."""
    data = request.json
    fecha_inicio = datetime.strptime(data['fecha_inicio'], '%Y-%m-%d')

    turnos_fijos = query_db('SELECT * FROM turnos_fijos WHERE activo = 1')

    turnos_creados = 0
    for tf in turnos_fijos:
        dias_diferencia = (tf['dia_semana'] - fecha_inicio.weekday()) % 7
        fecha_turno = fecha_inicio + timedelta(days=dias_diferencia)
        fecha_str = fecha_turno.strftime('%Y-%m-%d')

        existe = query_db(
            'SELECT id FROM turnos WHERE fecha = ? AND horario = ? AND turno_fijo_id = ?',
            (fecha_str, tf['horario'], tf['id']),
            fetchone=True
        )

        if not existe:
            query_db(
                'INSERT INTO turnos (fecha, horario, nombre_cliente, servicio_id, turno_fijo_id, estado) VALUES (?, ?, ?, ?, ?, ?)',
                (fecha_str, tf['horario'], tf['nombre_cliente'], tf['servicio_id'], tf['id'], 'pendiente'),
                commit=True
            )
            turnos_creados += 1

    return jsonify({'message': f'{turnos_creados} turnos generados'})

# ============ API PAGOS ============

@app.route('/api/pagos', methods=['GET'])
def get_pagos():
    fecha_inicio = request.args.get('fecha_inicio')
    fecha_fin = request.args.get('fecha_fin')
    medio_pago = request.args.get('medio_pago')

    query = '''
        SELECT p.*, t.fecha, t.nombre_cliente, s.nombre as servicio_nombre
        FROM pagos p
        JOIN turnos t ON p.turno_id = t.id
        LEFT JOIN servicios s ON t.servicio_id = s.id
        WHERE 1=1
    '''
    params = []

    if fecha_inicio and fecha_fin:
        query += ' AND t.fecha BETWEEN ? AND ?'
        params.extend([fecha_inicio, fecha_fin])

    if medio_pago:
        query += ' AND p.medio_pago = ?'
        params.append(medio_pago)

    query += ' ORDER BY p.fecha_hora DESC'

    pagos = query_db(query, params)
    return jsonify(pagos)

# ============ API MÉTRICAS ============

@app.route('/api/metricas', methods=['GET'])
def get_metricas():
    fecha_inicio = request.args.get('fecha_inicio')
    fecha_fin = request.args.get('fecha_fin')

    total = query_db(
        '''SELECT COALESCE(SUM(p.monto), 0) as total
           FROM pagos p
           JOIN turnos t ON p.turno_id = t.id
           WHERE t.fecha BETWEEN ? AND ?''',
        (fecha_inicio, fecha_fin),
        fetchone=True
    )

    por_medio = query_db(
        '''SELECT p.medio_pago, COALESCE(SUM(p.monto), 0) as total, COUNT(*) as cantidad
           FROM pagos p
           JOIN turnos t ON p.turno_id = t.id
           WHERE t.fecha BETWEEN ? AND ?
           GROUP BY p.medio_pago''',
        (fecha_inicio, fecha_fin)
    )

    por_dia = query_db(
        '''SELECT t.fecha, COALESCE(SUM(p.monto), 0) as total, COUNT(*) as cantidad
           FROM pagos p
           JOIN turnos t ON p.turno_id = t.id
           WHERE t.fecha BETWEEN ? AND ?
           GROUP BY t.fecha
           ORDER BY t.fecha''',
        (fecha_inicio, fecha_fin)
    )

    turnos_stats = query_db(
        '''SELECT estado, COUNT(*) as cantidad
           FROM turnos
           WHERE fecha BETWEEN ? AND ?
           GROUP BY estado''',
        (fecha_inicio, fecha_fin)
    )

    return jsonify({
        'total': total['total'] if total else 0,
        'por_medio_pago': por_medio or [],
        'por_dia': por_dia or [],
        'turnos_por_estado': turnos_stats or []
    })

# Inicializar DB siempre (necesario para gunicorn)
init_db()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
