/**
 * Pre-defined Project Recipes (Bill of Materials)
 * Reusable blueprints for popular electronics & IoT projects.
 * Selecting a recipe instantly populates all required components.
 */
export const defaultProjectRecipes = [
  {
    id: 'recipe-plant-watering',
    name: 'Automatic Plant Watering using ESP32',
    category: 'IoT & Agriculture',
    defaultPayment: 1600,
    components: [
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: 'Capacitive / Soil Moisture Sensor', qty: 1 },
      { name: '1-Channel 5V Relay Module', qty: 1 },
      { name: 'Water Pump 5-9V DC (Single)', qty: 1 },
      { name: '8mm Plastic Pipe (per meter)', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1M (pack)', qty: 1 },
      { name: '18650 2 Cell Battery Holder', qty: 1 },
      { name: '18650 3.7V 2200mAh Li-ion Cell', qty: 2 }
    ]
  },
  {
    id: 'recipe-smart-dustbin',
    name: 'Smart Dustbin',
    category: 'Automation & Sensors',
    defaultPayment: 1200,
    components: [
      { name: 'TowerPro SG90 9G Servo Motor', qty: 1 },
      { name: 'HC-SR04 Ultrasonic Distance Sensor', qty: 1 },
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: '9V Battery HW', qty: 1 },
      { name: 'Battery Snapper with DC Jack', qty: 1 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 1 }
    ]
  },
  {
    id: 'recipe-photoelectric',
    name: 'Photoelectric based detection system',
    category: 'Analog & Sensors',
    defaultPayment: 1100,
    components: [
      { name: 'IR LED 5mm', qty: 1 },
      { name: 'NPN Phototransistor 5mm (L14G2)', qty: 1 },
      { name: 'LED 05mm Red', qty: 1 },
      { name: '220E Resistor 5% 0.25W', qty: 2 },
      { name: '10K Resistor 5% 0.25W', qty: 1 },
      { name: 'LM7805 Voltage Regulator', qty: 1 },
      { name: '0.1uF Ceramic Capacitor', qty: 2 },
      { name: '9V Battery HW', qty: 1 },
      { name: 'Battery Snapper', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1M (pack)', qty: 1 }
    ]
  },
  {
    id: 'recipe-gesture-ai',
    name: 'Gesture based automatic ai controller',
    category: 'AI & Robotics',
    defaultPayment: 1600,
    components: [
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: '1-Channel 5V Relay Module', qty: 1 },
      { name: '12V DC Fan', qty: 1 },
      { name: '12V 2A Power Adapter', qty: 1 },
      { name: 'LM2596 DC-DC Buck 3A', qty: 1 },
      { name: 'LED 05mm Red', qty: 3 },
      { name: '220E Resistor 5% 0.25W', qty: 3 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 1 },
      { name: 'Mini Rocker Switch', qty: 1 }
    ]
  },
  {
    id: 'recipe-parking-slot',
    name: 'Parking lot system with slot detection',
    category: 'Smart City & Automation',
    defaultPayment: 1600,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'IR Module Imported', qty: 6 },
      { name: '16×2 I2C Green', qty: 1 },
      { name: 'Servo Motor SG90 180 Degree', qty: 1 },
      { name: 'LED 05mm Green', qty: 5 },
      { name: 'LED 05mm Red', qty: 5 },
      { name: '220E Resistor 5% 0.25W', qty: 10 },
      { name: '1000uF Capacitor', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1M (pack)', qty: 1 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 1 },
      { name: 'USB AB Cable 0.5m', qty: 1 }
    ]
  },
  {
    id: 'recipe-street-light',
    name: 'Street Light Vechile Detect',
    category: 'Smart City & Automation',
    defaultPayment: 1200,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'IR Module Imported', qty: 4 },
      { name: 'LED 05mm White/Blue', qty: 5 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1M (pack)', qty: 1 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 2 }
    ]
  },
  {
    id: 'recipe-fingerprint-attendance',
    name: 'Fingerprint Attendance System',
    category: 'Biometrics & Security',
    defaultPayment: 1900,
    components: [
      { name: 'AS608 Fingerprint Reader', qty: 1 },
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: '16×2 I2C Green', qty: 1 },
      { name: '10mm Goli Buzzer', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 1 }
    ]
  },
  {
    id: 'recipe-esp-web-car',
    name: 'ESP Web Car',
    category: 'Robotics & RC',
    defaultPayment: 1900,
    components: [
      { name: 'Robot Smart Chassis 4 Wheels', qty: 1 },
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: 'L298 Motor Driver Board', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: '18650 2-Cell Battery Holder', qty: 1 },
      { name: '18650 3.7V 2200mAh Li-ion Cell', qty: 2 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 1 }
    ]
  },
  {
    id: 'recipe-water-management',
    name: 'Smart Water Management System',
    category: 'IoT & Sensors',
    defaultPayment: 1250,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: '16×2 I2C Green', qty: 1 },
      { name: 'HC-SR04 Ultrasonic Distance Sensor', qty: 1 },
      { name: '1-Channel 5V Relay Module', qty: 1 },
      { name: 'Water Pump 5-9V DC (Single)', qty: 1 },
      { name: '8mm Plastic Pipe (per meter)', qty: 1 },
      { name: '18650 2 Cell Battery Holder', qty: 1 },
      { name: '18650 3.7V 2200mAh Li-ion Cell', qty: 2 },
      { name: '400 Tie Point Breadboard', qty: 1 }
    ]
  },
  {
    id: 'recipe-android-door',
    name: 'Android Based Door Open System',
    category: 'Home Automation',
    defaultPayment: 1850,
    components: [
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: '12V Solenoid Lock', qty: 1 },
      { name: '1-Channel 5V Relay Module', qty: 1 },
      { name: 'LM2596 DC-DC Buck 3A', qty: 1 },
      { name: '12V 2A Power Adapter', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 }
    ]
  },
  {
    id: 'recipe-solar-tracker',
    name: 'Solar Panel Tracker',
    category: 'Renewable Energy',
    defaultPayment: 1300,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'Solar Panel 04V 100mA (70x70mm)', qty: 1 },
      { name: 'Servo Motor SG90 180 Degree', qty: 1 },
      { name: 'LDR 05mm', qty: 2 },
      { name: '10K Resistor 5% 0.25W', qty: 5 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'USB AB Cable 0.5m', qty: 1 }
    ]
  },
  {
    id: 'recipe-tree-protection-rfid',
    name: 'Wireless Tree Protection System RFID',
    category: 'Wireless & Security',
    defaultPayment: 1900,
    components: [
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: 'RFID Reader RC522', qty: 1 },
      { name: 'RFID Key Chain 13.56MHz', qty: 2 },
      { name: 'PIR Sensor SR501', qty: 1 },
      { name: '10mm Goli Buzzer', qty: 1 },
      { name: 'LED 05mm Red', qty: 5 },
      { name: 'LED 05mm Green', qty: 5 },
      { name: '400 Tie Point Breadboard', qty: 1 }
    ]
  },
  {
    id: 'recipe-lifi-audio',
    name: 'Li-Fi Audio',
    category: 'Optoelectronics & Audio',
    defaultPayment: 800,
    components: [
      { name: 'Laser Light 5V 650nm', qty: 1 },
      { name: 'Solar Panel 04V 100mA (70x70mm)', qty: 1 },
      { name: 'AUX Cable 4FT', qty: 1 },
      { name: '100E Resistor 5% 0.25W', qty: 5 },
      { name: 'Speaker 2.5 Inch / Amplifier', qty: 1 },
      { name: '9V Battery HW', qty: 1 },
      { name: 'Battery Snapper', qty: 1 }
    ]
  },
  {
    id: 'recipe-hall-effect-parking',
    name: 'Hall Effect Parking',
    category: 'Sensors & Automation',
    defaultPayment: 1650,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'Hall Effect Magnetic Sensor Module', qty: 1 },
      { name: '16×2 I2C Green', qty: 1 },
      { name: 'Servo Motor SG90 180 Degree', qty: 1 },
      { name: '10mm Goli Buzzer', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1M (pack)', qty: 1 }
    ]
  },
  {
    id: 'recipe-temp-fan',
    name: 'Temp control fan / Temperature Fan',
    category: 'Environmental & Sensors',
    defaultPayment: 850,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'DHT11 Sensor Module', qty: 1 },
      { name: '16×2 I2C Green', qty: 1 },
      { name: 'L298 Motor Driver Board', qty: 1 },
      { name: '12V DC Fan', qty: 1 },
      { name: '12V 2A Power Adapter', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 }
    ]
  },
  {
    id: 'recipe-object-avoidance-car',
    name: 'Object Avoidance Car',
    category: 'Robotics & RC',
    defaultPayment: 1400,
    components: [
      { name: 'Robot Smart Chassis 4 Wheels', qty: 1 },
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'L298 Motor Driver Board', qty: 1 },
      { name: 'HC-SR04 Ultrasonic Distance Sensor', qty: 1 },
      { name: 'Servo Motor SG90 180 Degree', qty: 1 },
      { name: '18650 2-Cell Battery Holder', qty: 1 },
      { name: '18650 3.7V 2200mAh Li-ion Cell', qty: 2 }
    ]
  },
  {
    id: 'recipe-arduino-ldr',
    name: 'Arduino LDR LED Light Control',
    category: 'Sensors & Lighting',
    defaultPayment: 850,
    components: [
      { name: 'Arduino Uno 328 SMD', qty: 1 },
      { name: 'LDR 05mm / LDR Module', qty: 1 },
      { name: '10K Resistor 5% 0.25W', qty: 1 },
      { name: '220E Resistor 5% 0.25W', qty: 2 },
      { name: 'LED 05mm Red', qty: 3 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'USB AB Cable 0.5m', qty: 1 },
      { name: 'Jumper Cable 1M-1M (pack)', qty: 1 }
    ]
  },
  {
    id: 'recipe-fingerprint-lock',
    name: 'Fingerprint Lock with servo',
    category: 'Biometrics & Security',
    defaultPayment: 1700,
    components: [
      { name: 'AS608 Fingerprint Reader', qty: 1 },
      { name: 'ESP32 30-Pin Module', qty: 1 },
      { name: 'Servo Motor SG90 180 Degree', qty: 1 },
      { name: '10mm Goli Buzzer', qty: 1 },
      { name: '16×2 I2C Green', qty: 1 },
      { name: '400 Tie Point Breadboard', qty: 1 },
      { name: 'Jumper Cable 1M-1F (pack)', qty: 1 }
    ]
  }
];
