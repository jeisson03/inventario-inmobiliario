// ============================================
// BACKEND - Google Apps Script
// TODO por GET para evitar problemas de CORS
// ============================================

var CARPETA_RAIZ = 'Inventario Inmobiliario';

function doGet(e) {
  var p = e.parameter;
  Logger.log('doGet action: ' + p.action);

  if (p.action === 'crear') {
    return ContentService.createTextOutput(JSON.stringify(crearInmueble(p.nombre)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'guardarFotos') {
    var fotos = JSON.parse(p.fotos);
    Logger.log('guardarFotos: ' + fotos.length + ' fotos para carpeta ' + p.carpetaId);
    return ContentService.createTextOutput(JSON.stringify(guardarFotos(p.carpetaId, fotos)))
      .setMimeType(ContentService.MimeType.JSON);
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

  return ContentService.createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function getCarpetaRaiz() {
  var c = DriveApp.getFoldersByName(CARPETA_RAIZ);
  if (c.hasNext()) return c.next();
  return DriveApp.createFolder(CARPETA_RAIZ);
}

function crearInmueble(nombre) {
  try {
    if (!nombre || nombre.trim() === '') throw new Error('Nombre requerido');
    var limpio = nombre.trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_');
    var raiz = getCarpetaRaiz();
    var ts = new Date().getTime();
    var carpeta = raiz.createFolder(limpio + '_' + ts);
    return { success: true, id: carpeta.getId(), nombre: nombre };
  } catch (e) { return { success: false, error: e.message }; }
}

function guardarFotos(carpetaId, fotos) {
  try {
    var carpeta = DriveApp.getFolderById(carpetaId);
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

function listarInmuebles() {
  try {
    var raiz = getCarpetaRaiz();
    var carpetas = raiz.getFolders();
    var lista = [];
    while (carpetas.hasNext()) {
      var c = carpetas.next();
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
