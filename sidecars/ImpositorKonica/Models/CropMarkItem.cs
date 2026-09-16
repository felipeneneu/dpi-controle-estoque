using System;
using System.Windows;

namespace ImpositorKonica.Models
{
    public class CropMarkItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Point StartPointMm { get; set; }
        public Point EndPointMm { get; set; }
        public Rect AssociatedSlotRect { get; set; }
        public bool IsSelected { get; set; }
        public bool IsDeleted { get; set; }

        public CropMarkItem Clone()
        {
            return new CropMarkItem
            {
                Id = this.Id,
                StartPointMm = this.StartPointMm,
                EndPointMm = this.EndPointMm,
                AssociatedSlotRect = this.AssociatedSlotRect,
                IsSelected = this.IsSelected,
                IsDeleted = this.IsDeleted
            };
        }    }
}
