---
title: Contacto
---

<div class="contact-page">
  <p class="contact-intro">¿Tienes una pregunta o quieres ponerte en contacto? Escríbeme.</p>
  <form id="contact-form" class="contact-form">
    <div class="contact-field">
      <label for="contact-name">Nombre</label>
      <input id="contact-name" name="name" type="text" autocomplete="name" required />
    </div>
    <div class="contact-field">
      <label for="contact-email">Correo electrónico</label>
      <input id="contact-email" name="email" type="email" autocomplete="email" required />
    </div>
    <div class="contact-field contact-full-width">
      <label for="contact-subject">Asunto</label>
      <input id="contact-subject" name="subject" type="text" required />
    </div>
    <div class="contact-field contact-full-width">
      <label for="contact-message">Mensaje</label>
      <textarea id="contact-message" name="message" rows="7" required></textarea>
    </div>
    <button class="contact-submit" type="submit">Enviar mensaje</button>
    <p class="contact-note">Al enviar, se abrirá tu aplicación de correo con el mensaje preparado.</p>
  </form>
</div>