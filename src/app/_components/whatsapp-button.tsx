import { businessInfo, whatsappHref } from '@/lib/site/site-config';
import './whatsapp-button.css';

/**
 * Floating WhatsApp button. It exists only when the owner configured a WhatsApp number
 * (WHATSAPP_NUMBER): the site never points at a channel that is not there. Opens a chat with a
 * prefilled greeting; counted as a lead when analytics is on and accepted (data-track).
 */
export default function WhatsAppButton() {
  const { whatsapp } = businessInfo();
  if (!whatsapp) return null;
  return (
    <a
      className="wa-fab"
      href={whatsappHref(whatsapp, 'Hola, tengo una consulta sobre Reventa Segura.')}
      target="_blank"
      rel="noopener noreferrer"
      data-track="generate_lead"
      data-track-label="whatsapp"
      aria-label="Escríbenos por WhatsApp (se abre en una pestaña nueva)"
    >
      <svg className="wa-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 1.9a8.1 8.1 0 1 1-4.2 15l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 0 1 12 3.9zM8.6 7.3c-.2 0-.5.1-.7.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4l-1.8-.9c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.5-1.4-1.8-.2-.3 0-.4.1-.5l.4-.5c.1-.1.2-.3.3-.5.1-.2 0-.4 0-.5l-.8-2c-.2-.5-.4-.4-.6-.4z" />
      </svg>
      <span className="wa-label">WhatsApp</span>
    </a>
  );
}
