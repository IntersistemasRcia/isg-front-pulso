# Recursos visuales del ingreso de ISG Pulso

## Uso recomendado en React

- `pulso-icon.svg`: identidad en encabezado y formulario.
- `pulso-bi-hero.svg`: ilustración principal del panel visual.
- `login-visual-background.png`: fondo del panel izquierdo.
- `favicon.ico`: pestaña del navegador.
- Los PNG son alternativas para plataformas que no admitan SVG.

```jsx
<section className="loginVisual">
  <img className="brandIcon" src="/assets/pulso-icon.svg" alt="" />
  <img className="biIllustration" src="/assets/pulso-bi-hero.svg"
       alt="Panel con indicadores comerciales de ejemplo" />
</section>
```

```css
.loginVisual { background: url('/assets/login-visual-background.png') center / cover no-repeat; }
.biIllustration { width: min(90%, 900px); height: auto; }
```

Los importes de la ilustración son ejemplos visuales. Los indicadores funcionales deben provenir de ISG Connect.
