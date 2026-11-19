import { listingStatusLabel, type ListingStatus } from '@/lib/account/labels';
import { sellerListings } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../../_components/empty-state';
import EventPoster from '../../_components/event-poster';
import { requireUser } from '../../session';
import WithdrawButton from '../withdraw-button';

export const metadata = { title: 'Mis publicaciones' };
export const dynamic = 'force-dynamic';

const LISTING_TONE: Record<ListingStatus, string> = {
  pending: 'chip warning',
  verified: 'chip info',
  rejected: 'chip danger',
  sold: 'chip success',
  withdrawn: 'chip neutral',
};

export default async function MyListingsPage() {
  const user = await requireUser('/vender/publicaciones');
  const mine = await sellerListings(getDb(), user.userId);

  return (
    <section className="section-panel" aria-labelledby="listings-title">
      <h2 id="listings-title" className="section-title">
        Mis publicaciones <span className="count">{String(mine.length).padStart(2, '0')}</span>
      </h2>
      {mine.length === 0 ? (
        <EmptyState>
          <p>No has publicado entradas.</p>
          <a className="btn sm secondary" href="/vender">Publicar una entrada</a>
        </EmptyState>
      ) : (
        <div className="list-group">
          {mine.map((l) => (
            <div key={l.listingId} className="list-row listing-thumb-row">
              <div className="listing-thumb">
                <EventPoster seed={l.eventId} title={l.eventName} image={eventCoverImage(l.eventId, l.eventName)} size="thumb" sizes="44px" />
              </div>
              <div className="list-label">
                {l.eventName}
                <div className="list-sub">
                  <span className="muted">{formatPanamaDateTime(l.startsAt)}</span>
                  <span className="muted money">{formatUsd(l.askCents)}</span>
                  <span className={LISTING_TONE[l.status]}>{listingStatusLabel(l.status)}</span>
                </div>
              </div>
              {l.status === 'pending' || l.status === 'verified' ? <WithdrawButton listingId={l.listingId} eventName={l.eventName} /> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
