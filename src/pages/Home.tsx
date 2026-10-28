import Hero from "../sections/Hero";
import Featured from "../sections/Featured";
import Walkthrough from "../sections/Walkthrough";
import Categories from "../sections/Categories";
import BrandStory from "../sections/BrandStory";
import Craft from "../sections/Craft";
import Testimonials from "../sections/Testimonials";
import Editorial from "../sections/Editorial";
import CTA from "../sections/CTA";
import CartDrawer from "../components/CartDrawer";
import AnchorNav from "../components/AnchorNav";

export default function Home() {
  return (
    <div>
      <AnchorNav />
      <Hero />
      <Featured />
      <Walkthrough />
      <Categories />
      <BrandStory />
      <Craft />
      <Testimonials />
      <Editorial />
      <CTA />
      <CartDrawer />
    </div>
  );
}
