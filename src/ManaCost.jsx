// Renders a mana cost string ("{2}{R}{R}", "{G/P}", "1WU") as Scryfall's
// official mana symbol SVGs. Unparseable tokens fall back to text.

function symbolCode(token) {
  // Scryfall symbol filenames: braces + slashes removed, uppercased.
  // {W/U} -> WU, {2/W} -> 2W, {W/P} -> WP, {R} -> R, {12} -> 12.
  return token.replace(/[{}/]/g, "").toUpperCase();
}

function Pip({ token }) {
  const code = symbolCode(token);
  if (!code) return null;
  return (
    <img
      className="mana-pip"
      src={`https://svgs.scryfall.io/card-symbols/${code}.svg`}
      alt={`{${code}}`}
      title={`{${code}}`}
      loading="lazy"
    />
  );
}

function ManaCost({ cost }) {
  if (!cost) return null;
  // Double-faced costs arrive as "AAA // BBB"; render both sides.
  const faces = cost.split(" // ");
  return (
    <span className="mana-cost-pips">
      {faces.map((face, fi) => {
        const tokens = face.match(/\{[^}]+\}/g) ?? [];
        return (
          <span key={fi} className="mana-face">
            {fi > 0 && <span className="mana-slash">//</span>}
            {tokens.map((t, i) => (
              <Pip key={i} token={t} />
            ))}
          </span>
        );
      })}
    </span>
  );
}

export default ManaCost;
