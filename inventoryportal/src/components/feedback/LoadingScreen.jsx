import "./LoadingScreen.css";

const LoadingScreen = ({ message = "Loading inventory workspace..." }) => (
  <div className="loading-screen">
    <div className="loading-card">
      <div className="loading-bar" />
      <span>{message}</span>
    </div>
  </div>
);

export default LoadingScreen;
