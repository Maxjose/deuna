// Update the URL without starting a browser fragment navigation or resetting Next's history state.
export function writeAppHash(target: Pick<Window,'history'|'location'>, hash:string) {
  const next=hash.startsWith('#')?hash:`#${hash}`;
  if(target.location.hash===next)return;
  target.history.pushState({...target.history.state,rideStep:false},'',next);
}
