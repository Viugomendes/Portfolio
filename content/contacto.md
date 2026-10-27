---
title: Contact
---

<div class="contact-page">
  <p class="contact-intro">Have a question or want to get in touch? Drop me a line.</p>
  <form id="contact-form" class="contact-form">
    <div class="contact-field">
      <label for="contact-name">Name</label>
      <input id="contact-name" name="name" type="text" autocomplete="name" required />
    </div>
    <div class="contact-field">
      <label for="contact-email">Email</label>
      <input id="contact-email" name="email" type="email" autocomplete="email" required />
    </div>
    <div class="contact-field contact-full-width">
      <label for="contact-subject">Subject</label>
      <input id="contact-subject" name="subject" type="text" required />
    </div>
    <div class="contact-field contact-full-width">
      <label for="contact-message">Message</label>
      <textarea id="contact-message" name="message" rows="7" required></textarea>
    </div>
    <button class="contact-submit" type="submit">Send message</button>
    <p class="contact-note">When you submit, your email app will open with the message ready.</p>
  </form>
</div>