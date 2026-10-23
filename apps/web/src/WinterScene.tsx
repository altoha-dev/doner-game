// Original pixel town: layered skyline, warm doner kiosk, four friends and a snowy promenade.
export function WinterScene() {
  return <svg className="winter-scene" viewBox="0 0 320 150" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#172e48" d="M0 0h320v150H0z" />
    <path fill="#203c56" d="M0 54h320v96H0z" />
    <path fill="#2b4960" d="M0 83h320v67H0z" />
    <path fill="#28465e" d="M249 13h24v4h5v22h-5v5h-24v-5h-5V17h5z" />
    <path fill="#b4d2d8" d="M252 17h16v3h4v16h-4v4h-16v-4h-4V21h4z" />
    <path fill="#172e48" d="M259 15h17v17h-17v-4h-4v-8h4z" />
    {[16,43,82,116,192,224,290,309].map((x,i)=><rect key={x} x={x} y={9+i%3*9} width={i%3===0?2:1} height={2} fill={i%3===0?'#f5d6a0':'#789eb4'} />)}
    <path fill="#243f57" d="M0 58h17V44h24v14h21V35h33v17h19v-8h22v32h42V43h30v12h18V36h26v21h37V49h31v70H0z" />
    <path fill="#4a6a80" d="M17 44h24v2H17zm45-9h33v2H62zm116 8h30v2h-30zm48-7h26v2h-26zm63 13h31v2h-31z" />
    {[22,70,85,182,202,232,298].map((x,i)=><path key={x} fill={i%2?'#8b836e':'#587c91'} d={`M${x} 62h3v5h-3zm0 11h3v5h-3z`} />)}
    <path fill="#344e63" d="M4 79h57v44H4zM260 77h60v47h-60z" />
    <path fill="#658195" d="M1 75h63v5H1zm8-7h46v7H9zm248 5h63v5h-63zm8-7h48v7h-48z" />
    <path fill="#bed6dc" d="M1 75h63v2H1zm8-7h46v3H9zm248 5h63v2h-63zm8-7h48v2h-48z" />
    <path fill="#182f46" d="M11 87h15v18H11zm25 0h15v18H36zm235 0h15v19h-15zm25 0h15v19h-15z" />
    <path fill="#ad9275" d="M13 89h11v13H13zm25 0h11v13H38zm235 0h11v14h-11zm25 0h11v14h-11z" />
    <path fill="#455a68" d="M18 89h1v14h-1zm25 0h1v14h-1zm235 0h1v14h-1zm25 0h1v14h-1z" />
    <path fill="#1b3746" d="M75 61h5v7h4v6h5v7h5v10h-8v7H66v-7h-8V81h5v-7h6v-6h6zm160-5h5v9h4v8h6v9h6v11h-8v8h-23v-8h-8V82h6v-9h6v-8h6z" />
    <path fill="#adcdd1" d="M72 68h11v2H72zm-9 13h27v2H63zm163-8h20v2h-20zm-6 12h33v2h-33z" />
    <path fill="#12283c" d="M102 69h116v61H102z" />
    <path fill="#735957" d="M106 77h108v49H106z" />
    <path fill="#8a6960" d="M108 78h104v2H108zm0 37h104v2H108z" />
    <path fill="#3d5364" d="M99 66h122v9H99zm8-7h106v7H107zm16-7h75v7h-75z" />
    <path fill="#e6eee3" d="M97 65h126v4H97zm10-7h106v4H107zm16-7h75v3h-75z" />
    <path fill="#a1c6d2" d="M102 69h5v7h-5zm107 0h5v5h-5z" />
    <path fill="#20394c" d="M130 60h60v15h-60z" /><path fill="#d6aa78" d="M132 61h56v1h-56zm0 12h56v1h-56z" />
    <text x="160" y="71" textAnchor="middle" fill="#ffe2a4" fontFamily="Pixelify Sans, monospace" fontSize="11" letterSpacing="2">DONER</text>
    <path fill="#233749" d="M112 85h67v27h-67zm76-5h20v46h-20z" />
    <path fill="#e4a865" d="M114 87h63v23h-63z" /><path fill="#ffce88" d="M116 89h59v12h-59z" />
    <path fill="#a77957" d="M129 87h2v23h-2zm25 0h2v23h-2z" />
    <path fill="#f4ddaa" d="M119 91h7v3h-7zm18 0h13v3h-13zm23 0h11v3h-11z" />
    <path fill="#a86e4b" d="M137 99h11v8h-11z" /><path fill="#d9a066" d="M139 97h7v2h-7z" />
    <path fill="#294153" d="M191 84h14v21h-14z" /><path fill="#a8c9ce" d="M193 86h10v15h-10z" /><path fill="#e8bd78" d="M191 111h2v3h-2z" />
    {[0,1,2,3,4,5,6].map(i=><rect key={i} x={110+i*10} y={80} width={10} height={5} fill={i%2?'#dfcba7':'#9e6057'} />)}
    <path fill="#e7eee4" d="M109 79h72v2h-72zm-1 33h72v3h-72z" /><path fill="#4c677c" d="M106 122h108v5H106z" />
    <path fill="#162d41" d="M43 83h3v42h-3zm233-2h3v45h-3z" />
    <path fill="#4a5360" d="M39 76h12v12H39zm233-2h12v12h-12z" />
    <path fill="#ffcb85" d="M41 78h8v8h-8zM274 76h8v8h-8z" /><path fill="#fff0bf" d="M42 79h2v5h-2zM275 77h2v5h-2z" />
    <path fill="#e1eae4" d="M37 74h16v3H37zM270 72h16v3h-16z" />
    <path fill="#a9cbd3" d="M0 126h28v-3h49v3h30v2h97v-3h58v2h58v23H0z" />
    <path fill="#e4eee6" d="M0 125h28v-3h49v3h30v2h97v-3h58v2h58v4H0z" />
    <path fill="#779cac" d="M0 141h320v9H0z" /><path fill="#bfdae0" d="M0 139h45v2H0zm72-2h68v2H72zm106 3h74v2h-74z" />
    {[['#e9a15b','#f6d18d',81,111],['#ae97d7','#f2cadf',220,110],['#68bcb4','#e2ba74',245,114],['#806db3','#a7dbe6',60,119]].map(([coat,scarf,x,y],i)=><g key={i} transform={`translate(${x} ${y})`}>
      <path fill="#193246" d="M1 1h9v18H1z" /><path fill={String(coat)} d="M1 2h9v4H1zM0 9h11v8H0z" /><path fill="#edc7a0" d="M2 6h7v4H2z" /><path fill={String(scarf)} d="M0 9h12v2H0zM0 10h2v5H0z" /><path fill="#14293c" d="M1 17h3v3H1zm6 0h3v3H7zM7 7h1v1H7z" />
    </g>)}
    <g className="winter-steam" fill="#a8c9ce"><path d="M167 43h9v2h-9zm-3-8h7v2h-7zm6-7h5v2h-5z" /></g>
    <g className="winter-snow" fill="#d8e7e4">{[12,38,92,126,158,205,267,302].map((x,i)=><rect key={x} x={x} y={32+i%4*23} width="2" height="2" />)}</g>
  </svg>;
}
