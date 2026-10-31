package com.de1na.app.pruebas;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;

/** Recibe notificaciones y permisos de ubicación delegados por Chrome para la TWA. */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
    }
}
