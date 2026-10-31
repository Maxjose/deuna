const steps=[['searching','Buscando'],['assigned','Asignado'],['arrived','Llegó'],['ongoing','En camino'],['finished','Finalizado']];
export function TripProgress({status,headline}:{status:string;headline?:string}){
 const current=steps.findIndex(([key])=>key===status);if(current<0)return null;
 return <div className="trip-progress"><span className="trip-progress-step">Paso {current+1} de {steps.length} · {steps[current][1]}</span>{headline&&<strong className="trip-progress-title">{headline}</strong>}<ol aria-label="Estado del viaje">{steps.map(([key,label],index)=><li key={key} className={index<current?'done':index===current?'current':''} aria-current={index===current?'step':undefined}><span aria-hidden="true"/>{label}</li>)}</ol></div>;
}
