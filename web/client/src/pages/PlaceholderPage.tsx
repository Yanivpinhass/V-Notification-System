import React from 'react';

export const PlaceholderPage: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-muted-foreground mb-2">
          לא מיושם עדיין
        </h1>
        <p className="text-sm text-muted-foreground">
          העמוד הזה יהיה זמין בקרוב
        </p>
      </div>
    </div>
  );
};

export default PlaceholderPage;
