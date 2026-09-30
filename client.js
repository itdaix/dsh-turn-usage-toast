/**
 * Browser half of the Turn-usage toast.
 *
 * Registers one occupant on `conversation.composer.dock` — a session-scoped
 * seat that hands the occupant `useChat` for the active Session — and portals a
 * card to `document.body` so the card is positioned against the viewport rather
 * than the composer's own layout.
 *
 * The card reports exactly two facts: the model route and the tokens the
 * completed Turn consumed. Both come from the Turn's settled `turn-tail` Chat
 * node, whose `tokenUsage` is exact provider-reported accounting.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-turn-usage-toast',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    /** Locale namespace this plugin owns. */
    const NS = 'turn-usage-toast';
    /** Session-scoped seat providing `useChat` for the active Session. */
    const SLOT = 'conversation.composer.dock';
    /** How long the card stays before dismissing itself. */
    const VISIBLE_MS = 6000;
    /** Above every column; `shell.overlay` entries sit well below this. */
    const Z_INDEX = 2147483000;

    /** One 万, the unit this card counts in above ten thousand. */
    const WAN = 10000;

    /**
     * Token count in the 万 unit: 8252 / 1万 / 1.25万 / 327.54万.
     *
     * Below 10,000 the exact count is already readable and stays verbatim.
     * Above it the card divides by 10,000 and keeps at most two decimals,
     * trimming trailing zeros so 10,000 reads `1万` rather than `1.00万`.
     * @param value - non-negative token count.
     * @returns display string without the unit suffix.
     */
    function formatTokens(value) {
      if (value < WAN) return String(value);
      // Two decimals, then drop trailing zeros (`1.00` -> `1`, `1.20` -> `1.2`).
      const rounded = Math.round((value / WAN) * 100) / 100;
      return String(rounded);
    }

    /**
     * Latest Turn's settled tail payload, or undefined when no Turn has one.
     *
     * Returns the stored payload object itself, so the selector's result is
     * referentially stable between snapshot reads and changes identity exactly
     * when that Turn's accounting changes.
     * @param snapshot - Chat snapshot of the active Session.
     * @returns the tail payload, or undefined.
     */
    function selectLatestTurnTail(snapshot) {
      const timeline = snapshot === null || snapshot === undefined ? undefined : snapshot.timeline;
      const locations = snapshot === null || snapshot === undefined ? undefined : snapshot.locations;
      const nodes = snapshot === null || snapshot === undefined ? undefined : snapshot.nodes;
      if (timeline === undefined || locations === undefined || nodes === undefined) return undefined;
      const turns = timeline.turnOrder;
      for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
        const keys = locations.getTurn(turns[turnIndex]);
        for (let keyIndex = keys.length - 1; keyIndex >= 0; keyIndex -= 1) {
          const node = nodes.get(keys[keyIndex]);
          if (node !== undefined && node !== null && node.kind === 'turn-tail') return node.data;
        }
      }
      return undefined;
    }

    /**
     * The card: model route plus the Turn's token total.
     * Container and text colors ride host theme tokens, so light and dark both work.
     */
    function ToastCard({ usage, t, onClose, onHoverChange }) {
      const routes = usage.routes;
      const model = routes === undefined || routes.length === 0
        ? undefined
        : routes.map((route) => route.model).join(', ');
      const closeLabel = typeof t === 'function' ? t('close') : 'Close';
      // The unit follows the magnitude: exact counts stay in `tok`, and the
      // 万 form carries the unit itself.
      const isWan = usage.totalTokens >= WAN;
      const unit = isWan ? '\u4e07' : 'tok';
      return h(
        'div',
        {
          role: 'status',
          'aria-live': 'polite',
          onMouseEnter: () => { onHoverChange(true); },
          onMouseLeave: () => { onHoverChange(false); },
          style: {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: Z_INDEX,
            boxSizing: 'border-box',
            minWidth: '160px',
            maxWidth: '280px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-overlay)',
            color: 'var(--dsw-alias-label-primary)',
            border: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
            font: 'inherit',
            fontSize: '12px',
            lineHeight: 1.4,
            pointerEvents: 'auto',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline', gap: '5px' } },
          h(
            'span',
            { style: { fontSize: '20px', fontWeight: 600, letterSpacing: '-0.01em' } },
            formatTokens(usage.totalTokens),
          ),
          h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } }, unit),
          h(
            'button',
            {
              type: 'button',
              'aria-label': closeLabel,
              onClick: onClose,
              style: {
                marginLeft: 'auto',
                alignSelf: 'flex-start',
                border: 'none',
                background: 'transparent',
                color: 'var(--dsw-alias-label-secondary)',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: '14px',
                lineHeight: 1,
                padding: '0 2px',
              },
            },
            '\u00d7',
          ),
        ),
        model === undefined
          ? null
          : h(
            'div',
            {
              style: {
                marginTop: '2px',
                fontSize: '11px',
                color: 'var(--dsw-alias-label-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            },
            model,
          ),
      );
    }

    /**
     * Occupant that watches the active Session's Turns and, once per newly
     * closed Turn, shows the card.
     * @param props - slot-provided standard props; `useChat` and `t` are used.
     */
    function TurnUsageToast({ useChat, t }) {
      const tail = useChat(selectLatestTurnTail);
      const [shown, setShown] = useState(null);
      const [hovered, setHovered] = useState(false);
      // The Turn already settled when this occupant mounted must not fire a
      // card: a page load is not a completed Turn.
      const primedRef = useRef(false);
      const seenTurnRef = useRef(null);

      useEffect(() => {
        const settled = tail !== undefined && tail !== null;
        const turn = settled ? tail.turn : undefined;
        const usage = settled ? tail.tokenUsage : undefined;
        if (!primedRef.current) {
          primedRef.current = true;
          // A Turn that had ALREADY settled when this occupant mounted is not
          // news — a page load is not a completed Turn. An in-flight or absent
          // Turn stays unclaimed, so its own settlement still fires; claiming it
          // here would swallow the first Turn after installation, because that
          // Turn is typically the one running at mount time.
          seenTurnRef.current = usage === undefined ? undefined : turn;
          return;
        }
        // Evidence incomplete: leave the Turn unclaimed and wait for its settled
        // accounting instead of discarding it.
        if (usage === undefined) return;
        if (turn === seenTurnRef.current) return;
        seenTurnRef.current = turn;
        setHovered(false);
        setShown(usage);
      }, [tail]);

      // Auto-dismiss; resting the pointer on the card suspends the countdown.
      useEffect(() => {
        if (shown === null || hovered) return undefined;
        const timer = setTimeout(() => { setShown(null); }, VISIBLE_MS);
        return () => { clearTimeout(timer); };
      }, [shown, hovered]);

      const close = useCallback(() => { setShown(null); }, []);
      const onHoverChange = useCallback((next) => { setHovered(next); }, []);

      if (shown === null) return null;
      return createPortal(
        h(ToastCard, { usage: shown, t, onClose: close, onHoverChange }),
        document.body,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', { close: '关闭' }));
        ctx.effect(() => ctx.locale.register(NS, 'en', { close: 'Close' }));
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: 'turn-usage-toast',
          order: 10,
          locale: NS,
        }, TurnUsageToast));
      },
    };
  },
});
