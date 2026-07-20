import HeroSection from './components/sections/HeroSection'
import MarqueeSection from './components/sections/MarqueeSection'
import AboutSection from './components/sections/AboutSection'
import ServicesSection from './components/sections/ServicesSection'
import ProjectsSection from './components/sections/ProjectsSection'

export default function App() {
  return (
    <main
      style={{ backgroundColor: '#0C0C0C', overflowX: 'clip' }}
    >
      <HeroSection />
      <MarqueeSection />
      <AboutSection />
      <ServicesSection />
      <ProjectsSection />
    </main>
  )
}
