"""Prototipo local de atención, caja y personal para Novillo (stdlib)."""
import csv
from contextlib import contextmanager
import html
import json
import sqlite3
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).parent
DB = ROOT / "novillo.sqlite3"


def money(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ValueError("Importe inválido")
    if amount < 0:
        raise ValueError("El importe no puede ser negativo")
    return int(amount * 100)


def bs(cents):
    return f"Bs {cents / 100:,.2f}"


def esc(value):
    return html.escape(str(value), quote=True)


@contextmanager
def db():
    con = sqlite3.connect(DB, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    try:
        with con:
            yield con
    finally:
        con.close()


def init():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, category TEXT NOT NULL,
          name TEXT NOT NULL, presentation TEXT NOT NULL, price INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY, opened_at TEXT NOT NULL,
          closed_at TEXT, opening INTEGER NOT NULL, counted INTEGER, note TEXT);
        CREATE TABLE IF NOT EXISTS draft(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL DEFAULT '{}',
          customer_name TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'idle', ticket INTEGER, updated_at TEXT);
        CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL REFERENCES shifts(id),
          ticket INTEGER NOT NULL, created_at TEXT NOT NULL, payment TEXT NOT NULL,
          total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendiente',
          UNIQUE(shift_id,ticket));
        CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
          product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL,
          qty INTEGER NOT NULL, unit_price INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cash_movements(id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL REFERENCES shifts(id),
          created_at TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
          full_rate INTEGER NOT NULL, half_rate INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS workdays(id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id),
          work_date TEXT NOT NULL, planned TEXT NOT NULL, worked TEXT NOT NULL,
          earned INTEGER NOT NULL, note TEXT NOT NULL, UNIQUE(staff_id,work_date));
        CREATE TABLE IF NOT EXISTS staff_payments(id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id),
          paid_at TEXT NOT NULL, amount INTEGER NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL);
        """)
        if not con.execute("SELECT 1 FROM products LIMIT 1").fetchone():
            with (ROOT / "menu-inicial.csv").open(encoding="utf-8-sig", newline="") as source:
                con.executemany("INSERT INTO products(category,name,presentation,price) VALUES(?,?,?,?)",
                    [(r['categoria'], r['producto'], r['presentacion'], money(r['precio_bs']))
                     for r in csv.DictReader(source)])
        con.execute("INSERT OR IGNORE INTO draft(id,data,state,updated_at) VALUES(1,'{}','idle',?)",
                    (datetime.now().isoformat(timespec="seconds"),))


def layout(title, body, refresh=False):
    reload_tag = '<meta http-equiv="refresh" content="3">' if refresh else ''
    return f'''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{reload_tag}
    <title>{esc(title)} · Novillo</title><style>
    :root{{font-family:system-ui,Arial;background:#f8f4ee;color:#24201b}}body{{max-width:1100px;margin:auto;padding:20px}}
    h1{{font-size:2rem;margin:.3em 0}}h2{{margin-top:1.6em}}nav a{{display:inline-block;margin:4px 12px 4px 0;color:#9b4a11}}
    .card{{background:white;border:1px solid #e5dace;border-radius:12px;padding:18px;margin:12px 0;box-shadow:0 2px 8px #0001}}
    .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}}input,select,button{{font:inherit;padding:9px;border-radius:7px;border:1px solid #bda998;max-width:100%}}
    button{{background:#a94f16;color:white;border:0;cursor:pointer}}button:hover{{background:#873d10}}
    table{{border-collapse:collapse;width:100%}}td,th{{text-align:left;padding:8px;border-bottom:1px solid #eee}}.muted{{color:#71665d}}
    .total{{font-size:2rem;font-weight:800;color:#9b4a11}}.error{{color:#a00}}label{{display:inline-block;margin:6px}}
    @media print{{nav,form,button{{display:none}}body{{background:white}}}}
    </style><body><header><h1>NOVILLO</h1><nav><a href="/">Atención</a><a href="/caja">Caja</a><a href="/cocina">Cocina</a><a href="/personal">Personal</a><a href="/cliente" target="_blank">Segunda pantalla ↗</a></nav></header>{body}</body></html>'''


class App(BaseHTTPRequestHandler):
    def send(self, body, status=200, content_type="text/html; charset=utf-8"):
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def redirect(self, path):
        self.send_response(303)
        self.send_header("Location", path)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def form(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > 100000:
            raise ValueError("Formulario demasiado grande")
        return {k: v[0] for k, v in parse_qs(self.rfile.read(size).decode()).items()}

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            with db() as con:
                if path == "/": body = self.orders(con)
                elif path == "/cliente": body = self.customer(con)
                elif path == "/caja": body = self.cash(con)
                elif path == "/cocina": body = self.kitchen(con)
                elif path == "/personal": body = self.staff(con)
                elif path.startswith('/ficha/'):
                    body = self.ticket(con, int(path.rsplit('/',1)[1]))
                elif path == "/cliente-estado":
                    row = con.execute("SELECT data,state,ticket FROM draft WHERE id=1").fetchone()
                    return self.send(json.dumps(dict(row)), content_type="application/json; charset=utf-8")
                else: return self.send(layout("No encontrado", "<p>Página no encontrada.</p>"), 404)
            self.send(layout("Novillo", body, refresh=path in ("/cliente", "/cocina")))
        except Exception as exc:
            self.send(layout("Error", f'<p class="error">{esc(exc)}</p>'), 500)

    def do_POST(self):
        try:
            f = self.form()
            path = urlparse(self.path).path
            with db() as con:
                if path == "/borrador":
                    items = {str(int(k[2:])): int(v) for k, v in f.items() if k.startswith("p_") and v.isdigit() and 0 < int(v) <= 99}
                    con.execute("UPDATE draft SET data=?,customer_name=?,state='draft',ticket=NULL,updated_at=? WHERE id=1",
                                (json.dumps(items), f.get('customer_name','').strip()[:80], datetime.now().isoformat(timespec="seconds")))
                    dest = "/"
                elif path == "/cobrar":
                    shift = con.execute("SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1").fetchone()
                    if not shift: raise ValueError("Primero abre caja")
                    draft = con.execute("SELECT data,state FROM draft WHERE id=1").fetchone()
                    if draft['state'] != 'draft': raise ValueError('El pedido ya fue cobrado o no está preparado')
                    quantities = json.loads(draft['data'])
                    if not quantities: raise ValueError("Agrega productos antes de cobrar")
                    payment = f.get('payment')
                    if payment not in ('efectivo', 'QR'): raise ValueError("Medio de pago inválido")
                    rows = []
                    for key, qty in quantities.items():
                        product = con.execute("SELECT * FROM products WHERE id=? AND active=1", (int(key),)).fetchone()
                        if not product or not 1 <= qty <= 99: raise ValueError("Producto o cantidad inválida")
                        rows.append((product, qty))
                    total = sum(p['price'] * qty for p, qty in rows)
                    ticket = con.execute("SELECT COALESCE(MAX(ticket),0)+1 FROM orders WHERE shift_id=?", (shift['id'],)).fetchone()[0]
                    cur = con.execute("INSERT INTO orders(shift_id,ticket,created_at,payment,total) VALUES(?,?,?,?,?)",
                                      (shift['id'], ticket, datetime.now().isoformat(timespec="seconds"), payment, total))
                    con.executemany("INSERT INTO order_items(order_id,product_id,name,qty,unit_price) VALUES(?,?,?,?,?)",
                                    [(cur.lastrowid, p['id'], p['name']+' · '+p['presentation'], qty, p['price']) for p, qty in rows])
                    con.execute("UPDATE draft SET state='paid',ticket=?,updated_at=? WHERE id=1",
                                (ticket, datetime.now().isoformat(timespec="seconds")))
                    dest = f"/ficha/{cur.lastrowid}"
                elif path == "/abrir-caja":
                    if con.execute("SELECT 1 FROM shifts WHERE closed_at IS NULL").fetchone(): raise ValueError("Ya hay una caja abierta")
                    con.execute("INSERT INTO shifts(opened_at,opening) VALUES(?,?)",
                                (datetime.now().isoformat(timespec="seconds"), money(f.get('opening', '0'))))
                    dest = "/caja"
                elif path == "/movimiento":
                    shift = con.execute("SELECT id FROM shifts WHERE closed_at IS NULL").fetchone()
                    if not shift: raise ValueError("No hay caja abierta")
                    kind = f.get('kind')
                    if kind not in ('ingreso', 'egreso'): raise ValueError("Movimiento inválido")
                    amount = money(f.get('amount'))
                    if amount == 0: raise ValueError("El importe debe ser mayor a cero")
                    con.execute("INSERT INTO cash_movements(shift_id,created_at,kind,amount,note) VALUES(?,?,?,?,?)",
                                (shift['id'], datetime.now().isoformat(timespec="seconds"), kind, amount, f.get('note','').strip()))
                    dest = "/caja"
                elif path == "/cerrar-caja":
                    shift = con.execute("SELECT id FROM shifts WHERE closed_at IS NULL").fetchone()
                    if not shift: raise ValueError("No hay caja abierta")
                    con.execute("UPDATE shifts SET closed_at=?,counted=?,note=? WHERE id=?",
                                (datetime.now().isoformat(timespec="seconds"), money(f.get('counted')), f.get('note',''), shift['id']))
                    dest = "/caja"
                elif path == "/estado":
                    status = f.get('status')
                    if status not in ('pendiente','preparando','listo','entregado'): raise ValueError("Estado inválido")
                    con.execute("UPDATE orders SET status=? WHERE id=?", (status, int(f.get('id','0'))))
                    dest = "/cocina"
                elif path == "/empleado":
                    name = f.get('name','').strip()
                    if not name: raise ValueError("Indica el nombre")
                    con.execute("INSERT INTO staff(name,role,full_rate,half_rate) VALUES(?,?,?,?)",
                                (name, f.get('role','').strip(), money(f.get('full_rate')), money(f.get('half_rate'))))
                    dest = "/personal"
                elif path == "/jornada":
                    sid = int(f.get('staff_id','0'))
                    person = con.execute("SELECT * FROM staff WHERE id=?", (sid,)).fetchone()
                    if not person: raise ValueError("Empleado inválido")
                    planned, worked = f.get('planned'), f.get('worked')
                    if planned not in ('ninguno','medio','completo') or worked not in ('ninguno','medio','completo'):
                        raise ValueError("Tipo de jornada inválido")
                    work_date = date.fromisoformat(f.get('work_date',''))
                    earned = {'ninguno':0,'medio':person['half_rate'],'completo':person['full_rate']}[worked]
                    con.execute("""INSERT INTO workdays(staff_id,work_date,planned,worked,earned,note)
                       VALUES(?,?,?,?,?,?) ON CONFLICT(staff_id,work_date) DO UPDATE SET
                       planned=excluded.planned,worked=excluded.worked,earned=excluded.earned,note=excluded.note""",
                       (sid, work_date.isoformat(), planned, worked, earned, f.get('note','').strip()))
                    dest = "/personal"
                elif path == "/pago-personal":
                    sid = int(f.get('staff_id','0'))
                    if not con.execute("SELECT 1 FROM staff WHERE id=?", (sid,)).fetchone(): raise ValueError("Empleado inválido")
                    amount = money(f.get('amount'))
                    if not amount: raise ValueError("El pago debe ser mayor a cero")
                    kind = f.get('kind')
                    if kind not in ('pago','adelanto'): raise ValueError("Tipo de pago inválido")
                    con.execute("INSERT INTO staff_payments(staff_id,paid_at,amount,kind,note) VALUES(?,?,?,?,?)",
                                (sid, datetime.now().isoformat(timespec="seconds"), amount, kind, f.get('note','').strip()))
                    dest = "/personal"
                else: return self.send(layout("No encontrado", "<p>Acción no encontrada.</p>"), 404)
            self.redirect(dest)
        except (ValueError, sqlite3.Error) as exc:
            self.send(layout("Error", f'<p class="error">{esc(exc)}</p><p><a href="/">Volver</a></p>'), 400)

    def orders(self, con):
        products = con.execute("SELECT * FROM products WHERE active=1 ORDER BY category,name,presentation").fetchall()
        draft = con.execute("SELECT * FROM draft WHERE id=1").fetchone()
        quantities = json.loads(draft['data']) if draft['state']=='draft' else {}
        shift = con.execute("SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1").fetchone()
        total = sum(p['price']*quantities.get(str(p['id']),0) for p in products)
        rows = ''.join(f'<tr><td>{esc(p["category"])} · {esc(p["name"])} · {esc(p["presentation"])}</td><td>{bs(p["price"])}</td><td><input type="number" min="0" max="99" name="p_{p["id"]}" value="{quantities.get(str(p["id"]),0)}" style="width:65px"></td></tr>' for p in products)
        info = f'<p>Caja abierta: turno #{shift["id"]}</p>' if shift else '<p class="error">Abre la caja antes de cobrar.</p>'
        return f'''<h2>Atención y pedidos</h2>{info}<div class="card"><p>Selecciona cantidades y pulsa «Mostrar al cliente». Abre la segunda pantalla en otra ventana o monitor.</p>
        <form method="post" action="/borrador"><label>Nombre o referencia del cliente <input name="customer_name" value="{esc(draft['customer_name'])}" maxlength="80"></label><table><tr><th>Producto</th><th>Precio</th><th>Cantidad</th></tr>{rows}</table><p><button>Mostrar al cliente</button></p></form></div>
        <div class="card"><p>Total del pedido mostrado</p><div class="total">{bs(total)}</div><form method="post" action="/cobrar"><label>Medio de pago <select name="payment"><option>efectivo</option><option>QR</option></select></label><button {'disabled' if not shift or not quantities else ''}>Cobrar y emitir ficha</button></form></div>'''

    def customer(self, con):
        draft = con.execute("SELECT * FROM draft WHERE id=1").fetchone()
        items = json.loads(draft['data'])
        products = {str(p['id']):p for p in con.execute("SELECT * FROM products").fetchall()}
        rows = ''.join(f'<tr><td>{qty} × {esc(products[key]["name"])} · {esc(products[key]["presentation"])}</td><td>{bs(qty*products[key]["price"])}</td></tr>' for key,qty in items.items() if key in products)
        total = sum(qty*products[key]['price'] for key,qty in items.items() if key in products)
        heading = f'¡Gracias! Su ficha es <strong>#{draft["ticket"]}</strong>' if draft['state']=='paid' else 'Su pedido' if items else 'Esperando pedido'
        customer = f'<p>Cliente: {esc(draft["customer_name"])}</p>' if draft['customer_name'] else ''
        sub = 'Pago recibido' if draft['state']=='paid' else 'Monto a cancelar'
        return f'<div class="card"><h1>{heading}</h1>{customer}<table>{rows}</table><p>{sub}</p><div class="total">{bs(total) if items else "—"}</div><p class="muted">NOVILLO · Sacaba, Cochabamba</p></div>'

    def cash(self, con):
        shift = con.execute("SELECT * FROM shifts ORDER BY id DESC LIMIT 1").fetchone()
        if not shift or shift['closed_at']:
            previous = ''
            if shift:
                cash_sales = con.execute("SELECT COALESCE(SUM(total),0) FROM orders WHERE shift_id=? AND payment='efectivo'",(shift['id'],)).fetchone()[0]
                qr_sales = con.execute("SELECT COALESCE(SUM(total),0) FROM orders WHERE shift_id=? AND payment='QR'",(shift['id'],)).fetchone()[0]
                income = con.execute("SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE shift_id=? AND kind='ingreso'",(shift['id'],)).fetchone()[0]
                expense = con.execute("SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE shift_id=? AND kind='egreso'",(shift['id'],)).fetchone()[0]
                expected = shift['opening']+cash_sales+income-expense
                previous = f'<div class="card"><h3>Último arqueo · turno #{shift["id"]}</h3><p>Cerrado: {esc(shift["closed_at"])}</p><p>Ventas en efectivo: {bs(cash_sales)} · QR: {bs(qr_sales)}</p><p>Efectivo esperado: {bs(expected)} · Contado: {bs(shift["counted"])} · Diferencia: {bs(shift["counted"]-expected)}</p></div>'
            return f'<h2>Caja</h2>{previous}<div class="card"><form method="post" action="/abrir-caja"><label>Fondo inicial Bs <input name="opening" type="number" min="0" step="0.01" required value="0"></label><button>Abrir caja</button></form></div>'
        sid = shift['id']
        cash_sales = con.execute("SELECT COALESCE(SUM(total),0) FROM orders WHERE shift_id=? AND payment='efectivo'",(sid,)).fetchone()[0]
        qr_sales = con.execute("SELECT COALESCE(SUM(total),0) FROM orders WHERE shift_id=? AND payment='QR'",(sid,)).fetchone()[0]
        income = con.execute("SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE shift_id=? AND kind='ingreso'",(sid,)).fetchone()[0]
        expense = con.execute("SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE shift_id=? AND kind='egreso'",(sid,)).fetchone()[0]
        expected = shift['opening']+cash_sales+income-expense
        return f'''<h2>Caja · turno #{sid}</h2><div class="grid"><div class="card"><p>Fondo inicial: {bs(shift['opening'])}</p><p>Ventas efectivo: {bs(cash_sales)}</p><p>Ventas QR: {bs(qr_sales)}</p><p>Otros ingresos: {bs(income)}</p><p>Egresos: {bs(expense)}</p><h2>Efectivo esperado: {bs(expected)}</h2><p>Ventas totales: {bs(cash_sales+qr_sales)}</p></div>
        <div class="card"><h3>Ingreso o egreso de efectivo</h3><form method="post" action="/movimiento"><select name="kind"><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select><input name="amount" type="number" min="0.01" step="0.01" placeholder="Bs" required><input name="note" placeholder="Motivo" required><button>Registrar</button></form></div></div>
        <div class="card"><h3>Arqueo y cierre</h3><form method="post" action="/cerrar-caja"><label>Efectivo contado Bs <input name="counted" type="number" min="0" step="0.01" required></label><input name="note" placeholder="Observación"><button>Cerrar caja</button></form></div>'''

    def kitchen(self, con):
        orders = con.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 40").fetchall()
        cards = ''
        for order in orders:
            items = con.execute("SELECT * FROM order_items WHERE order_id=?",(order['id'],)).fetchall()
            li = ''.join(f'<li>{x["qty"]} × {esc(x["name"])}</li>' for x in items)
            options = ''.join(f'<option value="{s}" {"selected" if order["status"]==s else ""}>{s}</option>' for s in ('pendiente','preparando','listo','entregado'))
            cards += f'<div class="card"><h3>Ficha #{order["ticket"]} · {esc(order["status"])}</h3><p>{esc(order["created_at"])}</p><ul>{li}</ul><form method="post" action="/estado"><input type="hidden" name="id" value="{order["id"]}"><select name="status">{options}</select><button>Actualizar</button></form></div>'
        return '<h2>Pedidos de cocina</h2>'+ (cards or '<p>Sin pedidos.</p>')

    def ticket(self, con, order_id):
        order = con.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
        if not order:
            raise ValueError('Ficha no encontrada')
        items = con.execute('SELECT * FROM order_items WHERE order_id=?', (order_id,)).fetchall()
        rows = ''.join(f'<tr><td>{x["qty"]} × {esc(x["name"])}</td><td>{bs(x["qty"]*x["unit_price"])}</td></tr>' for x in items)
        return f'''<div class="card"><h2>Ficha de atención #{order['ticket']}</h2><p>{esc(order['created_at'])} · Turno #{order['shift_id']}</p><table>{rows}</table><p class="total">Total pagado: {bs(order['total'])}</p><p>Medio de pago: {esc(order['payment'])}</p><p class="muted">Comprobante interno de atención. No es factura fiscal.</p><button onclick="window.print()">Imprimir ficha</button><a href="/"> Nuevo pedido</a></div>'''

    def staff(self, con):
        people = con.execute("SELECT * FROM staff WHERE active=1 ORDER BY name").fetchall()
        options = ''.join(f'<option value="{p["id"]}">{esc(p["name"])}</option>' for p in people)
        rows = ''
        for p in people:
            earned = con.execute("SELECT COALESCE(SUM(earned),0) FROM workdays WHERE staff_id=?",(p['id'],)).fetchone()[0]
            paid = con.execute("SELECT COALESCE(SUM(amount),0) FROM staff_payments WHERE staff_id=?",(p['id'],)).fetchone()[0]
            rows += f'<tr><td>{esc(p["name"])} · {esc(p["role"])}</td><td>{bs(p["full_rate"])}</td><td>{bs(p["half_rate"])}</td><td>{bs(earned)}</td><td>{bs(paid)}</td><td>{bs(earned-paid)}</td></tr>'
        days = con.execute("SELECT w.*,s.name FROM workdays w JOIN staff s ON s.id=w.staff_id ORDER BY work_date DESC LIMIT 30").fetchall()
        day_rows = ''.join(f'<tr><td>{esc(d["work_date"])}</td><td>{esc(d["name"])}</td><td>{esc(d["planned"])}</td><td>{esc(d["worked"])}</td><td>{bs(d["earned"])}</td></tr>' for d in days)
        return f'''<h2>Personal y planilla</h2><div class="card"><h3>Agregar empleado</h3><form method="post" action="/empleado"><input name="name" placeholder="Nombre" required><input name="role" placeholder="Cargo"><label>Jornada completa Bs <input name="full_rate" type="number" min="0" step="0.01" required></label><label>Medio turno Bs <input name="half_rate" type="number" min="0" step="0.01" required></label><button>Guardar</button></form></div>
        <div class="card"><h3>Jornada programada y trabajada</h3><form method="post" action="/jornada"><select name="staff_id">{options}</select><input name="work_date" type="date" value="{date.today()}" required><label>Programado <select name="planned"><option>ninguno</option><option>medio</option><option>completo</option></select></label><label>Trabajado <select name="worked"><option>ninguno</option><option>medio</option><option>completo</option></select></label><input name="note" placeholder="Observación"><button>Registrar jornada</button></form></div>
        <div class="card"><h3>Pago o adelanto</h3><form method="post" action="/pago-personal"><select name="staff_id">{options}</select><select name="kind"><option value="pago">Pago</option><option value="adelanto">Adelanto</option></select><input name="amount" type="number" min="0.01" step="0.01" placeholder="Bs" required><input name="note" placeholder="Observación"><button>Registrar pago</button></form></div>
        <div class="card"><h3>Saldos acumulados</h3><table><tr><th>Empleado</th><th>Día</th><th>Medio</th><th>Devengado</th><th>Pagado</th><th>Saldo</th></tr>{rows}</table></div>
        <div class="card"><h3>Últimas jornadas</h3><table><tr><th>Fecha</th><th>Empleado</th><th>Programado</th><th>Trabajado</th><th>Importe</th></tr>{day_rows}</table></div>'''


if __name__ == '__main__':
    init()
    print('Novillo: http://localhost:8000  |  segunda pantalla: http://localhost:8000/cliente')
    ThreadingHTTPServer(('127.0.0.1', 8000), App).serve_forever()
