import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.defaultplus.yeobaek',
  appName: '여백',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#B5654D',
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#FAF9F6',
      style: 'LIGHT',
    },
  },
};

export default config;
