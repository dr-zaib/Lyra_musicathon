// A non-interactive iOS-style keyboard, shown in the bottom slot while composing so the demo
// reads unmistakably as "this is where the keyboard is" (on a real phone the OS keyboard sits
// here instead). Pure presentation — dark QWERTY, sized to fill its container.

const ROW1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const ROW2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const ROW3 = ["z", "x", "c", "v", "b", "n", "m"];

function Key({ label, grow = 1, dark = false, small = false }: { label: string; grow?: number; dark?: boolean; small?: boolean }) {
  return (
    <div
      style={{ flexGrow: grow, flexBasis: 0 }}
      className={`flex items-center justify-center rounded-[5px] ${dark ? "bg-white/[0.08]" : "bg-white/[0.18]"} ${small ? "text-[11px]" : "text-[15px]"} font-normal text-white/90 shadow-[0_1px_0_rgba(0,0,0,0.45)]`}
    >
      {label}
    </div>
  );
}

export default function KeyboardMock() {
  return (
    <div aria-hidden className="flex h-full select-none flex-col gap-[6px] bg-[#1b1b1d] px-[4px] pb-[max(10px,env(safe-area-inset-bottom))] pt-[8px]">
      <div className="flex flex-1 gap-[5px]">{ROW1.map((c) => <Key key={c} label={c} />)}</div>
      <div className="flex flex-1 gap-[5px] px-[5%]">{ROW2.map((c) => <Key key={c} label={c} />)}</div>
      <div className="flex flex-1 gap-[5px]">
        <Key label="⇧" grow={1.5} dark />
        {ROW3.map((c) => <Key key={c} label={c} />)}
        <Key label="⌫" grow={1.5} dark />
      </div>
      <div className="flex flex-1 gap-[5px]">
        <Key label="123" grow={1.4} dark small />
        <Key label="🌐" grow={1} dark small />
        <Key label="space" grow={5} />
        <Key label="return" grow={2} dark small />
      </div>
    </div>
  );
}
