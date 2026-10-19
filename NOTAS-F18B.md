# F18-B — `x.ts` revisa su propio flag

## Hecho

- `src/lib/publish/x.ts`
  - `xPublisher().send` revisa `isChannelEnabled("x")` (`PUBLISH_X_ENABLED`)
    antes de leer credenciales (`readXEnv`) y antes de cualquier `fetch`.
  - Con el flag apagado lanza `El canal X está apagado.` (mismo estilo que
    Telegram), sin llamar a la red.
  - `validate` no cambia: sirve para previsualizar borradores con el canal
    apagado.
- `tests/publish-x.test.ts`
  - El flag se limpia/restaura en `beforeEach`/`afterEach` (por defecto apagado).
  - Nuevo bloque `xPublisher con el flag apagado`:
    - con credenciales, `send` rechaza y `fetch` no se llama;
    - sin credenciales, también falla cerrado con el mensaje del canal antes
      de leer el entorno.
  - Los tests existentes que llegan a `send` activan el flag con
    `enableChannel()`.

## Verificación

```
npx vitest run tests/publish-x.test.ts   # 13 passed
npm run lint                             # ok
npm test                                 # 39 files, 427 tests passed
npm run typecheck                        # ok
```

## Pendiente

Nada. `npm run build` lo corre el orquestador.

## Cómo probar

1. Sin `PUBLISH_X_ENABLED=true`, `xPublisher().send(draft)` debe rechazar con
   `El canal X está apagado.` y no hacer ninguna petición.
2. Con `PUBLISH_X_ENABLED=true` y las cuatro credenciales de X, el envío sigue
   el camino OAuth 1.0a de siempre.
