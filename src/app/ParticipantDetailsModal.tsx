// ParticipantDetailsModal.tsx – Professional view of a participant's itinerary and hotel schedule
import React from 'react';
import { X, Clock, Plane, Train, Users, MapPin, ArrowRight, Calendar } from 'lucide-react';
import type { Participant, Trajet } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  participant: Participant | null;
}

export const ParticipantDetailsModal: React.FC<Props> = ({ open, onClose, participant }) => {
  if (!open || !participant) return null;

  const transports = participant.logistique?.transports ?? [];
  const hotels = participant.logistique?.hotels ?? [];

  const renderTrajet = (t: Trajet, title: string, colorClass: string) => (
    <div className={`rounded-[32px] overflow-hidden border-2 ${colorClass === 'blue' ? 'bg-blue-50/40 border-blue-200' : 'bg-orange-50/40 border-orange-200'} shadow-sm`}>
      <div className={`px-6 py-4 border-b-2 flex justify-between items-center ${colorClass === 'blue' ? 'bg-blue-600' : 'bg-orange-500'}`}>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">{title}</span>
        {t.type === 'TRAIN' ? <Train className="w-5 h-5 text-white" /> : <Plane className="w-5 h-5 text-white" />}
      </div>
      <div className="p-8 space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Départ</p>
            <p className="text-lg font-black text-gray-900 leading-tight">{t.lieuDepart}</p>
            <p className={`text-4xl font-black ${colorClass === 'blue' ? 'text-blue-700' : 'text-orange-700'} mt-2`}>{t.depart}</p>
          </div>
          <div className="flex flex-col items-center pt-8">
            <ArrowRight className={`w-6 h-6 ${colorClass === 'blue' ? 'text-blue-200' : 'text-orange-200'}`} />
          </div>
          <div className="flex-1 text-right space-y-1">
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Arrivée</p>
            <p className="text-lg font-black text-gray-900 leading-tight">{t.lieuArrivee}</p>
            <p className={`text-4xl font-black ${colorClass === 'blue' ? 'text-blue-700' : 'text-orange-700'} mt-2`}>{t.arrivee || '--:--'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 pt-6 border-t-2 border-dashed border-gray-200">
          <div>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">N° de Transport</p>
            <p className="text-sm font-black text-gray-900">{t.numero || '---'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Date</p>
            <p className="text-sm font-black text-gray-900">{t.date || '--/--/----'}</p>
          </div>
          {t.placement && (
            <div className="col-span-2 bg-white/50 p-3 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Placement / Siège</p>
              <p className="text-sm font-black text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" /> {t.placement}
              </p>
            </div>
          )}
        </div>

        {t.correspondanceLieu && (
          <div className="mt-4 p-4 bg-amber-50 rounded-2xl border-2 border-amber-100">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1 italic">Escale / Correspondance</p>
            <p className="text-sm font-black text-amber-900">{t.correspondanceLieu} {t.correspondanceHeure ? `à ${t.correspondanceHeure}` : ''}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in duration-500">
        {/* Header - High Impact */}
        <div className="p-10 border-b-2 border-gray-50 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-blue-600 text-white rounded-3xl flex items-center justify-center text-3xl font-black italic shadow-2xl shadow-blue-200 ring-4 ring-white">
              {participant.nom.charAt(0)}
            </div>
            <div>
              <h3 className="text-4xl font-black tracking-tight text-gray-900">
                {participant.nom} {participant.prenom}
              </h3>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <span className="text-[11px] font-black uppercase bg-blue-100 text-blue-700 px-3 py-1.5 rounded-xl tracking-[0.2em]">Fiche Voyageur Pro</span>
                <span className="text-xs font-black text-gray-500 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-red-500" /> {participant.villeDepart}</span>
                {participant.dateNaissance && (
                  <span className="text-xs font-black text-gray-500 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-500" /> Né(e) le {participant.dateNaissance}
                  </span>
                )}
                {participant.sncf && (
                  <span className="text-xs font-black text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                    <Train className="w-4 h-4" /> SNCF: {participant.sncf}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-14 h-14 bg-white rounded-2xl border-2 border-gray-100 text-gray-400 hover:text-red-500 shadow-sm flex items-center justify-center transition-all hover:rotate-90 hover:border-red-100 group">
            <X className="w-8 h-8 group-hover:scale-110" />
          </button>
        </div>

        {/* Body - Clean & Readable */}
        <div className="flex-1 overflow-y-auto p-10 pt-0 space-y-12">
          {transports.length === 0 && hotels.length === 0 ? (
            <div className="py-32 text-center space-y-6">
              <div className="w-24 h-24 bg-gray-50 text-gray-200 rounded-full flex items-center justify-center mx-auto border-4 border-dashed border-gray-100">
                <MapPin className="w-12 h-12" />
              </div>
              <p className="text-gray-400 text-xl font-black italic">Aucune donnée logistique pour ce voyageur.</p>
            </div>
          ) : (
            <div className="mt-10 space-y-12">
              {/* Section Transports */}
              {transports.length > 0 && (
                <section className="space-y-8">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-blue-600 rounded-full" />
                    <h4 className="text-lg font-black text-gray-900 uppercase tracking-widest">Plan de Transport</h4>
                  </div>
                  {transports.map((prop, idx) => (
                    <div key={idx} className="space-y-6">
                      {transports.length > 1 && (
                        <div className="px-6 py-2 bg-gray-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] inline-block shadow-lg">Option de voyage {idx + 1}</div>
                      )}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        {renderTrajet(prop.aller, 'Vol / Train Aller', 'blue')}
                        {renderTrajet(prop.retour, 'Vol / Train Retour', 'orange')}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Section Hotels */}
              {hotels.length > 0 && (
                <section className="space-y-8">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                    <h4 className="text-lg font-black text-gray-900 uppercase tracking-widest">Hébergement</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {hotels.map((h, i) => (
                      <div key={i} className="bg-indigo-50 border-2 border-indigo-100 rounded-[32px] p-8 relative overflow-hidden group hover:bg-white hover:border-indigo-300 transition-all shadow-sm hover:shadow-xl">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-all">
                          <Train className="w-24 h-24" />
                        </div>
                        <p className="text-[11px] text-indigo-500 font-black uppercase tracking-[0.2em] mb-3">Hôtel Sélectionné #{i + 1}</p>
                        <p className="text-2xl font-black text-gray-900 leading-tight mb-8 underline decoration-indigo-200 underline-offset-8">{h.nom || 'Hôtel non spécifié'}</p>
                        <div className="grid grid-cols-2 gap-8 pt-6 border-t-2 border-indigo-50">
                          <div>
                            <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest mb-2">Check-in</p>
                            <p className="text-2xl font-black text-indigo-700 flex items-center gap-3">
                              <Clock className="w-6 h-6" /> {h.checkIn || '--:--'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest mb-2">Check-out</p>
                            <p className="text-2xl font-black text-indigo-700 flex items-center gap-3 justify-end">
                              <Clock className="w-6 h-6" /> {h.checkOut || '--:--'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-10 border-t-2 border-gray-50 bg-gray-50/50">
          <button onClick={onClose} className="w-full py-5 bg-white border-2 border-gray-200 text-gray-900 rounded-[24px] font-black text-sm uppercase tracking-[0.3em] shadow-sm hover:shadow-xl transition-all hover:bg-gray-900 hover:text-white hover:border-gray-900 transform active:scale-[0.98]">
            Quitter la Fiche
          </button>
        </div>
      </div>
    </div>
  );
};
