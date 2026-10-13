// ============================================
// BACKEND - Google Apps Script
// TODO por GET para evitar problemas de CORS
// ============================================

var CARPETA_RAIZ = 'Inventario Inmobiliario';

function doGet(e) {
  var p = e.parameter;
  Logger.log('doGet action: ' + p.action);

  if (p.action === 'crear') {
    return ContentService.createTextOutput(JSON.stringify(crearInmueble(p.nombre, p.clave)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'buscarOCrear') {
    return ContentService.createTextOutput(JSON.stringify(buscarOCrear(p.nombre)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'buscar') {
    return ContentService.createTextOutput(JSON.stringify(buscarExacto(p.nombre)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'traza') {
    try {
      var t = PropertiesService.getScriptProperties().getProperty('traza') || '[]';
      return ContentService.createTextOutput(JSON.stringify({ success: true, eventos: JSON.parse(t) }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (p.action === 'listar') {
    return ContentService.createTextOutput(JSON.stringify(listarInmuebles()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'fotos') {
    return ContentService.createTextOutput(JSON.stringify(obtenerFotosInmueble(p.carpetaId)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'eliminar') {
    return ContentService.createTextOutput(JSON.stringify(eliminarInmueble(p.carpetaId)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'test') {
    return ContentService.createTextOutput(JSON.stringify({ok: true, timestamp: new Date().getTime()}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'login') {
    return ContentService.createTextOutput(JSON.stringify(login(p.user, p.pass)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    Logger.log('doPost recibido');
    var raw = e.postData.contents;
    Logger.log('doPost raw length: ' + raw.length);

    var data;
    if (e.postData.type === 'application/x-www-form-urlencoded') {
      var params = raw.split('&');
      for (var i = 0; i < params.length; i++) {
        var pair = params[i].split('=');
        if (pair[0] === 'data') {
          data = JSON.parse(decodeURIComponent(pair.slice(1).join('=')));
          break;
        }
      }
    } else {
      data = JSON.parse(raw);
    }

    Logger.log('doPost action: ' + data.action);

    if (data.action === 'guardarFotos') {
      var fotos = data.fotos;
      Logger.log('guardarFotos: ' + fotos.length + ' fotos para carpeta ' + data.carpetaId);
      var result = guardarFotos(data.carpetaId, fotos);
      Logger.log('guardarFotos resultado: ' + JSON.stringify(result));
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'guardarInventario') {
      var result2 = guardarInventario(data.carpetaId, data.base64, data.nombre);
      return ContentService.createTextOutput(JSON.stringify(result2))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({success: false, error: 'accion no valida'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    Logger.log('doPost error: ' + e.message);
    return ContentService.createTextOutput(JSON.stringify({success: false, error: e.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getCarpetaRaiz() {
  // La raiz queda FIJADA por id: asi nunca se salta a otra carpeta con el mismo
  // nombre (o a una en papelera), que era lo que generaba carpetas duplicadas.
  var props = PropertiesService.getScriptProperties();
  var guardada = props.getProperty('raiz_id');
  if (guardada) {
    try {
      var g = DriveApp.getFolderById(guardada);
      if (!g.isTrashed()) return g;
    } catch (e) { /* se vuelve a resolver abajo */ }
  }
  var c = DriveApp.getFoldersByName(CARPETA_RAIZ);
  var mejor = null;
  var mejorHijos = -1;
  while (c.hasNext()) {
    var f = c.next();
    if (f.isTrashed()) continue;
    var n = 0;
    var hijas = f.getFolders();
    while (hijas.hasNext()) { hijas.next(); n++; if (n > 2000) break; }
    if (n > mejorHijos) { mejorHijos = n; mejor = f; }
  }
  if (mejor) {
    props.setProperty('raiz_id', mejor.getId());
    return mejor;
  }
  var nueva = DriveApp.createFolder(CARPETA_RAIZ);
  props.setProperty('raiz_id', nueva.getId());
  return nueva;
}

function limpiarNombre(nombre) {
  return nombre.trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

// ============================================
// USUARIOS DE LA APP: se administran en la hoja
// "USUARIOS APP (no borrar)" dentro de la carpeta
// Inventario Inmobiliario. Columnas: usuario | clave | nombre | activo.
// Para desactivar a alguien se escribe NO en "activo". No requiere redesplegar.
// (La hoja se crea sola la primera vez, con los 4 usuarios iniciales.)
// ============================================
var HOJA_USUARIOS_NOMBRE = 'USUARIOS APP (no borrar)';

function getHojaUsuarios() {
  var raiz = getCarpetaRaiz();
  var files = raiz.getFilesByName(HOJA_USUARIOS_NOMBRE);
  if (files.hasNext()) {
    try { return SpreadsheetApp.open(files.next()).getSheets()[0]; } catch (e) {}
  }
  var ss = SpreadsheetApp.create(HOJA_USUARIOS_NOMBRE);
  try { DriveApp.getFileById(ss.getId()).moveTo(raiz); } catch (e2) {}
  var hoja = ss.getSheets()[0];
  hoja.getRange(1, 1, 1, 4).setValues([['usuario', 'clave', 'nombre', 'activo']]);
  hoja.getRange(2, 1, 4, 4).setValues([
    ['juan', '123456', 'Juan', 'SI'],
    ['camilo', '123456', 'Camilo', 'SI'],
    ['andres', '123456', 'Andrés', 'SI'],
    ['julio', '123456', 'Julio', 'SI']
  ]);
  return hoja;
}

function leerUsuarios() {
  var mapa = {};
  var hoja = getHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    var u = (datos[i][0] || '').toString().trim().toLowerCase();
    if (!u) continue;
    mapa[u] = {
      pass: (datos[i][1] || '').toString(),
      nombre: (datos[i][2] || '').toString().trim() || u,
      activo: (datos[i][3] || '').toString().trim().toUpperCase() !== 'NO'
    };
  }
  return mapa;
}

function login(user, pass) {
  try {
    var u = (user || '').toString().trim().toLowerCase();
    var reg = leerUsuarios()[u];
    if (reg && reg.activo && reg.pass === (pass || '').toString()) {
      return { success: true, usuario: u, nombre: reg.nombre };
    }
    return { success: false, error: 'Usuario o clave incorrectos' };
  } catch (e) { return { success: false, error: e.message }; }
}

/**
 * Guarda un evento de traza (ultimos 50) para diagnosticar duplicados.
 * Se lee con action=traza.
 */
function trazar(nombre, clave, resultado, detalle) {
  try {
    var props = PropertiesService.getScriptProperties();
    var arr = JSON.parse(props.getProperty('traza') || '[]');
    arr.push({ t: new Date().getTime(), nombre: nombre, clave: (clave || '').toString().slice(-8), resultado: resultado, detalle: detalle || '' });
    while (arr.length > 50) arr.shift();
    props.setProperty('traza', JSON.stringify(arr));
  } catch (e) {}
}

function crearInmueble(nombre, clave) {
  try {
    if (!nombre || nombre.trim() === '') throw new Error('Nombre requerido');
    // Candado: si dos subidas llegan al mismo tiempo, una espera a la otra
    // y asi nunca se crean dos carpetas con el mismo nombre
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      // Idempotencia por clave de sesion: si esta misma sesion ya creo su carpeta
      // (aunque la respuesta se haya perdido), se devuelve la misma sin duplicar
      if (clave) {
        var props = PropertiesService.getScriptProperties();
        var previo = props.getProperty('clave_' + clave);
        if (previo) {
          try {
            var ya = DriveApp.getFolderById(previo);
            if (!ya.isTrashed()) {
              trazar(nombre, clave, 'clave-hit', ya.getId());
              return { success: true, id: ya.getId(), nombre: nombre, existente: true };
            }
            props.deleteProperty('clave_' + clave);
          } catch (e2) { props.deleteProperty('clave_' + clave); }
        }
      }
      // Si ya existe una carpeta con el mismo nombre, la reutiliza y fusiona
      // duplicadas si las hubiera (evita carpetas duplicadas para siempre)
      var existente = buscarOCrear(nombre);
      if (existente.success && existente.existente) {
        if (clave) PropertiesService.getScriptProperties().setProperty('clave_' + clave, existente.id);
        trazar(nombre, clave, 'reutiliza', existente.id);
        return existente;
      }
      var limpio = limpiarNombre(nombre);
      var raiz = getCarpetaRaiz();
      var carpeta = raiz.createFolder(limpio);
      // Barrido post-creacion: si otra ejecucion creo la misma carpeta al mismo
      // tiempo (lectura desactualizada), se fusiona de inmediato y se devuelve
      // UNA sola sobreviviente. Asi el duplicado no sobrevive ni un minuto.
      var objetivo = carpetaVivaPorNombre(limpio);
      if (objetivo && objetivo.getId() !== carpeta.getId()) {
        fusionarDuplicadas(limpio, objetivo);
        trazar(nombre, clave, 'fusiona-post', objetivo.getId());
        carpeta = objetivo;
      }
      if (clave) PropertiesService.getScriptProperties().setProperty('clave_' + clave, carpeta.getId());
      trazar(nombre, clave, 'crea', carpeta.getId());
      return { success: true, id: carpeta.getId(), nombre: nombre };
    } finally {
      lock.releaseLock();
    }
  } catch (e) { return { success: false, error: e.message }; }
}

/**
 * Devuelve la carpeta viva MAS ANTIGUA con ese nombre exacto (ya limpiado), o null.
 * Elegir siempre la mas antigua hace estable el id: la app que la creo primero
 * nunca ve su carpeta desaparecer.
 */
function carpetaVivaPorNombre(limpio) {
  var raiz = getCarpetaRaiz();
  var carpetas = raiz.getFolders();
  var mejor = null;
  while (carpetas.hasNext()) {
    var c = carpetas.next();
    if (c.isTrashed()) continue;
    if (c.getName() === limpio) {
      if (!mejor || c.getDateCreated().getTime() < mejor.getDateCreated().getTime()) mejor = c;
    }
  }
  return mejor;
}

/**
 * Fusiona carpetas duplicadas con el mismo nombre: mueve todas las fotos a la
 * mas antigua y manda las demas a papelera. Si algo falla a mitad de camino,
 * la proxima llamada continua: converge siempre. Maximo 100 fotos por llamada
 * para no pasarse del limite de tiempo.
 */
function fusionarDuplicadas(limpio, objetivo) {
  try {
    var raiz = getCarpetaRaiz();
    var it = raiz.getFolders();
    var movidos = 0;
    while (it.hasNext()) {
      var f = it.next();
      if (f.isTrashed() || f.getName() !== limpio || f.getId() === objetivo.getId()) continue;
      try {
        var fs = f.getFiles();
        while (fs.hasNext() && movidos < 100) {
          try { fs.next().moveTo(objetivo); movidos++; } catch (e0) {}
        }
        if (!f.getFiles().hasNext()) { try { f.setTrashed(true); } catch (e1) {} }
      } catch (e2) {}
    }
  } catch (e3) {}
}

/**
 * Busca la carpeta del inmueble por nombre (exacto, con el mismo limpiado que crear).
 * Si no existe, la crea. Si hay duplicadas, las fusiona en la mas antigua.
 * Se usa para enlazar el inventario a la carpeta ya creada por las fotos.
 */
function buscarOCrear(nombre) {
  try {
    if (!nombre || nombre.trim() === '') throw new Error('Nombre requerido');
    var limpio = limpiarNombre(nombre);
    var raiz = getCarpetaRaiz();
    var objetivo = carpetaVivaPorNombre(limpio);
    if (objetivo) {
      fusionarDuplicadas(limpio, objetivo);
      return { success: true, id: objetivo.getId(), nombre: nombre, existente: true };
    }
    var carpeta = raiz.createFolder(limpio);
    return { success: true, id: carpeta.getId(), nombre: nombre, existente: false };
  } catch (e) { return { success: false, error: e.message }; }
}

/**
 * Busca la carpeta del inmueble por nombre EXACTO (sin recortes de _1, _2, etc).
 * Se usa desde la app para reutilizar la carpeta correcta sin ambiguedades.
 * Devuelve siempre la mas antigua para que el id sea estable.
 */
function buscarExacto(nombre) {
  try {
    if (!nombre || nombre.trim() === '') return { success: false };
    var limpio = limpiarNombre(nombre);
    var c = carpetaVivaPorNombre(limpio);
    if (c) return { success: true, id: c.getId(), nombre: nombre };
    return { success: false };
  } catch (e) { return { success: false, error: e.message }; }
}

function guardarFotos(carpetaId, fotos) {
  try {
    var carpeta = DriveApp.getFolderById(carpetaId);
    if (carpeta.isTrashed()) {
      // Esta carpeta fue fusionada con su duplicada: redirigir a la sobreviviente
      var viva = carpetaVivaPorNombre(carpeta.getName());
      if (viva) carpeta = viva;
      else throw new Error('carpeta en papelera');
    }
    var cnt = 0;
    for (var i = 0; i < fotos.length; i++) {
      var datos = Utilities.base64Decode(fotos[i].base64);
      var blob = Utilities.newBlob(datos, 'image/jpeg', fotos[i].nombre);
      carpeta.createFile(blob);
      cnt++;
    }
    return { success: true, fotosGuardadas: cnt };
  } catch (e) { return { success: false, error: e.message }; }
}

/**
 * Guarda el inventario (PDF) dentro de la carpeta del inmueble.
 * datos: { carpetaId, base64, nombre }
 */
function guardarInventario(carpetaId, base64, nombre) {
  try {
    var carpeta = DriveApp.getFolderById(carpetaId);
    var datos = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(datos, 'application/pdf', nombre || 'INVENTARIO.pdf');
    // Si ya existe un PDF con el mismo nombre (se re-guardó tras corregir),
    // se manda a papelera para no acumular duplicados: queda solo la versión nueva.
    try {
      var viejos = carpeta.getFilesByName(blob.getName());
      while (viejos.hasNext()) {
        var v = viejos.next();
        try { v.setTrashed(true); } catch (e1) {}
      }
    } catch (e0) {}
    carpeta.createFile(blob);
    return { success: true, nombre: blob.getName() };
  } catch (e) { return { success: false, error: e.message }; }
}

function listarInmuebles() {
  try {
    var raiz = getCarpetaRaiz();
    var carpetas = raiz.getFolders();
    var lista = [];
    while (carpetas.hasNext()) {
      var c = carpetas.next();
      if (c.isTrashed()) continue;
      var files = c.getFiles();
      var cnt = 0;
      while (files.hasNext()) { files.next(); cnt++; }
      lista.push({
        id: c.getId(),
        nombre: c.getName().replace(/_\d+$/, ''),
        fotos: cnt,
        fecha: c.getDateCreated().getTime()
      });
    }
    lista.sort(function(a, b) { return b.fecha - a.fecha; });
    return { success: true, inmuebles: lista };
  } catch (e) { return { success: false, error: e.message }; }
}

function obtenerFotosInmueble(carpetaId) {
  try {
    var carpeta = DriveApp.getFolderById(carpetaId);
    var files = carpeta.getFiles();
    var fotos = [];
    while (files.hasNext()) {
      var f = files.next();
      fotos.push({ id: f.getId(), nombre: f.getName(), url: f.getUrl() });
    }
    return { success: true, inmueble: carpeta.getName(), fotos: fotos };
  } catch (e) { return { success: false, error: e.message }; }
}

function eliminarInmueble(carpetaId) {
  try { DriveApp.getFolderById(carpetaId).setTrashed(true); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
}
