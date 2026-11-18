// Un tic cada medio segundo. El navegador frena los temporizadores y las animaciones de las
// pestañas ocultas, pero no los de un worker: así el gemelo sigue andando mientras se mira el panel.
setInterval(() => postMessage(0), 500);
